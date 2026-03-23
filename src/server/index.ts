import type { ApiRouteMethod } from "../index";

import { extractRouteLikeParams, matchPathname, trimPathSegments } from "../path-matching";
import { parseInternalRequestBody, type InternalRequestBody } from "./internal-requests";
import { createInternalHandlerHeaders } from "./request-headers";

type Awaitable<T> = T | Promise<T>;
type MiddlewareContextValue<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext | undefined;
};
type MiddlewareNext<TContext = unknown, TResult = unknown> = (overrides?: {
  context?: TContext | undefined;
}) => Promise<TResult>;
type MiddlewareHandler<TContext = unknown, TResult = unknown> = (
  context: MiddlewareContextValue<TContext>,
  next: MiddlewareNext<TContext, TResult>,
) => Awaitable<TResult>;

type LayoutModule = {
  id: string;
  path: string;
  options?: {
    layout?: LayoutModule;
    loader?: (context: unknown) => Awaitable<unknown>;
    middleware?: MiddlewareHandler<unknown, unknown>[];
  };
};

type RouteModule = {
  id: string;
  path: string;
  route?: {
    loader?: (context: unknown) => Awaitable<unknown>;
    action?: (context: unknown) => Awaitable<unknown>;
    options?: {
      layout?: LayoutModule;
      loader?: (context: unknown) => Awaitable<unknown>;
      action?: (context: unknown) => Awaitable<unknown>;
      middleware?: MiddlewareHandler<unknown, unknown>[];
    };
  };
};

type ResourceModule = {
  path: string;
  resource?: {
    loader?: (context: unknown) => Awaitable<unknown>;
    action?: (context: unknown) => Awaitable<unknown>;
    middleware?: MiddlewareHandler<unknown, unknown>[];
  };
};

type ApiModule = {
  path: string;
  api?: {
    middleware?: MiddlewareHandler<unknown, Response>[];
    methods?: Partial<
      Record<
        ApiRouteMethod,
        (context: {
          request: Request;
          params: Record<string, string>;
          signal: AbortSignal;
          context: unknown;
        }) => Promise<Response> | Response
      >
    >;
  };
};

type ServerManifest = {
  routes?: RouteModule[];
  resources?: ResourceModule[];
  apiRoutes?: ApiModule[];
};

let rscRendererPromise:
  | Promise<{
      renderToReadableStream(node: unknown): ReadableStream;
    }>
  | undefined;

export type CreateServerOptions<TContext = unknown> = {
  createContext?(request: Request): Promise<TContext> | TContext;
  onError?(error: unknown, context: TContext | undefined): void;
  manifest?: ServerManifest;
  document?: string | ((request: Request) => Promise<Response> | Response);
  assets?: (request: Request) => Promise<Response | null | undefined> | Response | null | undefined;
};

export function createServer<TContext = unknown>(
  options: CreateServerOptions<TContext> = {},
): { fetch(request: Request): Promise<Response> } {
  const manifest = options.manifest ?? {};

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let contextLoaded = false;
    let contextValue: TContext | undefined;

    async function getContext(): Promise<TContext | undefined> {
      if (contextLoaded) {
        return contextValue;
      }

      contextLoaded = true;
      contextValue = options.createContext ? await options.createContext(request) : undefined;
      return contextValue;
    }

    try {
      if (url.pathname === "/_litz/resource") {
        return handleResourceRequest(request, manifest.resources ?? [], getContext);
      }

      if (url.pathname === "/_litz/route" || url.pathname === "/_litz/action") {
        return handleRouteRequest(request, manifest.routes ?? [], getContext);
      }

      const apiResponse = await handleApiRequest(request, manifest.apiRoutes ?? [], getContext);

      if (apiResponse) {
        return apiResponse;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        const assetResponse = await options.assets?.(request);

        if (assetResponse) {
          return toHeadResponseIfNeeded(request, assetResponse);
        }

        if (shouldServeDocument(request, url.pathname)) {
          const documentResponse = await createDocumentResponse(options.document, request);

          if (documentResponse) {
            return toHeadResponseIfNeeded(request, documentResponse);
          }
        }
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      const context = contextLoaded ? contextValue : undefined;
      options.onError?.(error, context);

      return new Response("Litz server error.", {
        status: 500,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }
  }

  return { fetch: handle };
}

async function createDocumentResponse(
  document: CreateServerOptions["document"],
  request: Request,
): Promise<Response | null> {
  if (!document) {
    return null;
  }

  if (typeof document === "string") {
    return new Response(request.method === "HEAD" ? null : document, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return document(request);
}

function toHeadResponseIfNeeded(request: Request, response: Response): Response {
  if (request.method !== "HEAD") {
    return response;
  }

  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function handleResourceRequest<TContext>(
  request: Request,
  resources: ResourceModule[],
  getContext: () => Promise<TContext | undefined>,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await parseInternalRequestBody(request);
  const resourcePath = body.path;
  const operation = body.operation ?? "loader";
  const entry = resources.find((resource) => resource.path === resourcePath);

  if (!resourcePath || !entry?.resource) {
    return createLitzJsonResponse(404, { kind: "error", message: "Resource not found." });
  }

  const handler = operation === "action" ? entry.resource.action : entry.resource.loader;
  const middleware = entry.resource.middleware ?? [];

  if (!handler) {
    return createLitzJsonResponse(405, {
      kind: "error",
      message: `Resource does not define a ${operation}.`,
    });
  }

  const normalizedRequest = normalizeInternalRequest(
    request,
    resourcePath,
    body.request,
    body.payload,
  );
  const signal = request.signal;
  const context = await getContext();
  const result = await runMiddlewareChain({
    middleware,
    request: normalizedRequest.request,
    params: normalizedRequest.params,
    signal,
    context,
    execute(nextContext) {
      return handler({
        request: normalizedRequest.request,
        params: normalizedRequest.params,
        signal,
        context: nextContext,
      });
    },
  });

  return createServerResultResponse(result, `${entry.path}#${operation}`);
}

async function handleRouteRequest<TContext>(
  request: Request,
  routes: RouteModule[],
  getContext: () => Promise<TContext | undefined>,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await parseInternalRequestBody(request);
  const routePath = body.path;
  const targetId = body.target;
  const operation =
    body.operation ?? (new URL(request.url).pathname === "/_litz/action" ? "action" : "loader");
  const entry = routes.find((route) => route.path === routePath);

  if (!routePath || !entry?.route) {
    return createLitzJsonResponse(404, { kind: "error", message: "Route not found." });
  }

  const chain = getRouteMatchChain(entry);
  const target =
    operation === "action"
      ? chain[chain.length - 1]
      : findTargetRouteMatch(chain, targetId ?? routePath);

  if (!target) {
    return createLitzJsonResponse(404, { kind: "error", message: "Route target not found." });
  }

  const targetIndex = chain.findIndex((candidate) => candidate.id === target.id);
  const handler =
    operation === "action" ? (entry.route.action ?? entry.route.options?.action) : target.loader;
  const middleware = chain.slice(0, targetIndex + 1).flatMap((candidate) => candidate.middleware);

  if (!handler) {
    return createLitzJsonResponse(405, {
      kind: "error",
      message: `Route does not define a ${operation}.`,
    });
  }

  const normalizedRequest = normalizeInternalRequest(
    request,
    routePath,
    body.request,
    body.payload,
  );
  const signal = request.signal;
  const context = await getContext();
  const result = await runMiddlewareChain({
    middleware,
    request: normalizedRequest.request,
    params:
      operation === "action"
        ? normalizedRequest.params
        : (extractRouteLikeParams(target.path, new URL(normalizedRequest.request.url).pathname) ??
          normalizedRequest.params),
    signal,
    context,
    execute(nextContext) {
      const params =
        operation === "action"
          ? normalizedRequest.params
          : (extractRouteLikeParams(target.path, new URL(normalizedRequest.request.url).pathname) ??
            normalizedRequest.params);
      return handler({
        request: normalizedRequest.request,
        params,
        signal,
        context: nextContext,
      });
    },
  });

  return createServerResultResponse(result, `${target.id}#${operation}`);
}

async function handleApiRequest<TContext>(
  request: Request,
  apiRoutes: ApiModule[],
  getContext: () => Promise<TContext | undefined>,
): Promise<Response | null> {
  const url = new URL(request.url);
  const matched = apiRoutes
    .map((candidate) => ({
      entry: candidate,
      params: matchPathname(candidate.path, url.pathname),
    }))
    .find((candidate) => candidate.params !== null);

  if (!matched?.entry.api?.methods) {
    return null;
  }

  const params = matched.params;

  if (!params) {
    return null;
  }

  const method = request.method.toUpperCase() as Exclude<ApiRouteMethod, "ALL">;
  const handler = matched.entry.api.methods[method] ?? matched.entry.api.methods.ALL;
  const middleware = matched.entry.api.middleware ?? [];

  if (!handler) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const signal = request.signal;
  const context = await getContext();

  return runMiddlewareChain({
    middleware,
    request,
    params,
    signal,
    context,
    execute(nextContext) {
      return handler({
        request,
        params,
        signal,
        context: nextContext,
      });
    },
  });
}

async function runMiddlewareChain<TContext, TResult>(options: {
  middleware: MiddlewareHandler<TContext, TResult>[];
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext | undefined;
  execute(context: TContext | undefined): Awaitable<TResult>;
}): Promise<TResult> {
  const dispatch = async (index: number, context: TContext | undefined): Promise<TResult> => {
    const middleware = options.middleware[index];

    if (!middleware) {
      return options.execute(context);
    }

    let called = false;

    return middleware(
      {
        request: options.request,
        params: options.params,
        signal: options.signal,
        context,
      },
      async (overrides) => {
        if (called) {
          throw new Error("Litz middleware next() called multiple times.");
        }

        called = true;
        const nextContext =
          overrides && Object.prototype.hasOwnProperty.call(overrides, "context")
            ? overrides.context
            : context;
        return dispatch(index + 1, nextContext);
      },
    );
  };

  return dispatch(0, options.context);
}

function getRouteMatchChain(entry: RouteModule): Array<{
  id: string;
  path: string;
  loader?: (context: unknown) => Awaitable<unknown>;
  middleware: MiddlewareHandler<unknown, unknown>[];
}> {
  const layouts = collectLayouts(entry.route?.options?.layout);

  return [
    ...layouts.map((layout) => ({
      id: layout.id,
      path: layout.path,
      loader: layout.options?.loader,
      middleware: layout.options?.middleware ?? [],
    })),
    {
      id: entry.id,
      path: entry.path,
      loader: entry.route?.loader ?? entry.route?.options?.loader,
      middleware: entry.route?.options?.middleware ?? [],
    },
  ];
}

function collectLayouts(layout: LayoutModule | undefined): LayoutModule[] {
  if (!layout) {
    return [];
  }

  return [...collectLayouts(layout.options?.layout), layout];
}

function findTargetRouteMatch(
  chain: Array<{
    id: string;
    path: string;
    loader?: (context: unknown) => Awaitable<unknown>;
    middleware: MiddlewareHandler<unknown, unknown>[];
  }>,
  targetId: string,
):
  | {
      id: string;
      path: string;
      loader?: (context: unknown) => Awaitable<unknown>;
      middleware: MiddlewareHandler<unknown, unknown>[];
    }
  | undefined {
  return chain.find((entry) => entry.id === targetId);
}

async function createServerResultResponse(
  result: unknown,
  viewId = "litz#view",
): Promise<Response> {
  if (!result || typeof result !== "object" || !("kind" in result)) {
    return createLitzJsonResponse(500, {
      kind: "fault",
      message: "Handler returned an unknown result.",
    });
  }

  const serverResult = result as {
    kind: string;
    status?: number;
    headers?: HeadersInit;
    data?: unknown;
    node?: unknown;
    fields?: Record<string, string>;
    formError?: string;
    location?: string;
    replace?: boolean;
    revalidate?: string[];
    message?: string;
    code?: string;
    digest?: string;
  };

  const headers = new Headers(serverResult.headers);
  applyRevalidateHeader(headers, serverResult.revalidate);

  switch (serverResult.kind) {
    case "data":
      return createLitzJsonResponse(
        serverResult.status ?? 200,
        {
          kind: "data",
          data: serverResult.data,
          revalidate: serverResult.revalidate ?? [],
        },
        headers,
      );
    case "invalid":
      return createLitzJsonResponse(
        serverResult.status ?? 422,
        {
          kind: "invalid",
          fields: serverResult.fields,
          formError: serverResult.formError,
          data: serverResult.data,
        },
        headers,
      );
    case "redirect":
      return createLitzJsonResponse(
        serverResult.status ?? 303,
        {
          kind: "redirect",
          location: serverResult.location,
          replace: serverResult.replace ?? false,
          revalidate: serverResult.revalidate ?? [],
        },
        headers,
      );
    case "error":
      return createLitzJsonResponse(
        serverResult.status ?? 500,
        {
          kind: "error",
          message: serverResult.message ?? "Error",
          code: serverResult.code,
          data: serverResult.data,
        },
        headers,
      );
    case "fault":
      return createLitzJsonResponse(
        serverResult.status ?? 500,
        {
          kind: "fault",
          message: serverResult.message ?? "Fault",
          digest: serverResult.digest,
        },
        headers,
      );
    case "view": {
      headers.set("content-type", "text/x-component");
      headers.set("x-litz-kind", "view");
      headers.set("x-litz-status", String(serverResult.status ?? 200));
      headers.set("x-litz-view-id", viewId);
      const renderer = await loadRscRenderer();
      const stream = renderer.renderToReadableStream(serverResult.node);
      return new Response(stream, {
        status: serverResult.status ?? 200,
        headers,
      });
    }
    default:
      return createLitzJsonResponse(500, {
        kind: "fault",
        message: `Unsupported result kind "${serverResult.kind}".`,
      });
  }
}

async function loadRscRenderer(): Promise<{
  renderToReadableStream(node: unknown): ReadableStream;
}> {
  rscRendererPromise ??= import("@vitejs/plugin-rsc/rsc");
  return rscRendererPromise;
}

function createLitzJsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers?: Headers,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/vnd.litz.result+json");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function applyRevalidateHeader(headers: Headers, revalidate?: string[]): void {
  if (!revalidate?.length) {
    return;
  }

  headers.set("x-litz-revalidate", revalidate.join(","));
}

function normalizeInternalRequest(
  originalRequest: Request,
  pathPattern: string,
  requestData:
    | {
        params?: Record<string, string>;
        search?: Record<string, string>;
      }
    | undefined,
  payload: InternalRequestBody["payload"],
): {
  request: Request;
  params: Record<string, string>;
} {
  const params = requestData?.params ?? {};
  const search = new URLSearchParams(requestData?.search ?? {});
  const url = new URL(originalRequest.url);
  url.pathname = interpolatePath(pathPattern, params);
  url.search = search.toString();
  url.hash = "";

  let body: FormData | undefined;

  if (payload) {
    body = new FormData();

    for (const [key, value] of payload.entries) {
      body.append(key, value);
    }
  }

  return {
    request: new Request(url, {
      method: body ? "POST" : "GET",
      headers: createInternalHandlerHeaders(originalRequest.headers),
      signal: originalRequest.signal,
      body,
    }),
    params,
  };
}

function interpolatePath(pathPattern: string, params: Record<string, string>): string {
  return pathPattern.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = params[key];

    if (value === undefined) {
      throw new Error(`Missing required path param "${key}" for path "${pathPattern}".`);
    }

    return encodeURIComponent(value);
  });
}

function shouldServeDocument(request: Request, pathname: string): boolean {
  if (pathname.startsWith("/_litz/") || pathname.startsWith("/api/")) {
    return false;
  }

  if (lastPathSegment(pathname).includes(".")) {
    return false;
  }

  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("*/*");
}

function lastPathSegment(pathname: string): string {
  const segments = trimPathSegments(pathname);
  return segments.at(-1) ?? "";
}
