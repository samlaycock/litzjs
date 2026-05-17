import type { ApiRouteMethod, LitzApp } from "../index";

import { normalizeBasePath, resolveBasePathname } from "../base-path";
import {
  createBodylessResponse,
  createApiResponseFromResult,
  isBodyForbiddenStatus,
  isServerResultLike,
  resolveValidatedInput,
  type RuntimeInputValidation,
} from "../input-validation";
import {
  extractRouteLikeParams,
  hasMalformedPathnameEncoding,
  interpolatePath,
  matchPathname,
  sortByPathSpecificity,
  trimPathSegments,
} from "../path-matching";
import { createSearchParams, type SearchParamRecord } from "../search-params";
import { parseInternalRequestBody, type InternalRequestBody } from "./internal-requests";
import { createInternalHandlerHeaders } from "./request-headers";

type Awaitable<T> = T | Promise<T>;
type DocumentResponseValue = Response | string | null | undefined;
type DocumentResponseFactory = (request: Request) => Awaitable<DocumentResponseValue>;
type DocumentResponseOption = Response | string | DocumentResponseFactory;
export type InternalRequestKind = "route" | "resource";
export type InternalRequestOperation = "loader" | "action";
export type InternalRequestValidationContext<TContext = unknown> = {
  request: Request;
  kind: InternalRequestKind;
  operation: InternalRequestOperation;
  path: string | undefined;
  body: InternalRequestBody;
  context?: TContext | undefined;
};
export type InternalRequestValidationResult = Response | null | undefined | void;
export type InternalRequestValidator<TContext = unknown> = (
  context: InternalRequestValidationContext<TContext>,
) => Awaitable<InternalRequestValidationResult>;
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
    input?: RuntimeInputValidation;
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
      input?: RuntimeInputValidation;
      middleware?: MiddlewareHandler<unknown, unknown>[];
    };
  };
};

type RouteMatchEntry = {
  id: string;
  path: string;
  loader?: (context: unknown) => Awaitable<unknown>;
  input?: RuntimeInputValidation;
  middleware: MiddlewareHandler<unknown, unknown>[];
};

type BatchedLoaderResponseEntry = {
  status: number;
  headers?: Array<[string, string]>;
  body: {
    kind: "data" | "redirect" | "error" | "fault";
    data?: unknown;
    revalidate?: string[];
    location?: string;
    replace?: boolean;
    message?: string;
    code?: string;
    digest?: string;
  };
};

type ResourceModule = {
  path: string;
  resource?: {
    loader?: (context: unknown) => Awaitable<unknown>;
    action?: (context: unknown) => Awaitable<unknown>;
    input?: RuntimeInputValidation;
    middleware?: MiddlewareHandler<unknown, unknown>[];
  };
};

type ApiModule = {
  path: string;
  api?: {
    input?: RuntimeInputValidation;
    middleware?: MiddlewareHandler<unknown, Response>[];
    methods?: Partial<
      Record<
        ApiRouteMethod,
        (context: {
          request: Request;
          params: Record<string, string>;
          signal: AbortSignal;
          context: unknown;
          input: {
            params: unknown;
            search: unknown;
            headers: unknown;
            body: unknown;
          };
        }) => Promise<Response> | Response
      >
    >;
  };
};

export interface ServerManifest {
  readonly routes?: RouteModule[];
  readonly resources?: ResourceModule[];
  readonly apiRoutes?: ApiModule[];
}

export interface LitzRuntimeServer<TContext = unknown> {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly __litzjsCreateServerOptions?: CreateServerOptions<TContext>;
}

let rscRendererPromise:
  | Promise<{
      renderToReadableStream(node: unknown): ReadableStream;
    }>
  | undefined;

export type CreateServerOptions<TContext = unknown> = {
  createContext?(request: Request): Promise<TContext> | TContext;
  validateInternalRequest?: InternalRequestValidator<TContext>;
  onError?(error: unknown, context: TContext | undefined): void;
  app?: LitzApp;
  manifest?: ServerManifest;
  base?: string;
  document?: DocumentResponseOption;
  notFound?: DocumentResponseOption;
  assets?: (request: Request) => Promise<Response | null | undefined> | Response | null | undefined;
};

export function createServer<TContext = unknown>(
  options: CreateServerOptions<TContext> = {},
): LitzRuntimeServer<TContext> {
  const manifest = normalizeServerManifest(options.manifest, options.app);
  const basePath = normalizeBasePath(options.base);

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = resolveBasePathname(url.pathname, basePath);
    let contextLoaded = false;
    let contextValue: TContext | undefined;

    if (hasMalformedPathnameEncoding(url.pathname)) {
      return createBadRequestResponse();
    }

    async function getContext(): Promise<TContext | undefined> {
      if (contextLoaded) {
        return contextValue;
      }

      contextLoaded = true;
      contextValue = options.createContext ? await options.createContext(request) : undefined;
      return contextValue;
    }

    try {
      if (pathname === "/_litzjs/resource") {
        return await handleResourceRequest(
          request,
          manifest.resources ?? [],
          getContext,
          options.validateInternalRequest,
          (error, context) => options.onError?.(error, context),
          () => (contextLoaded ? contextValue : undefined),
        );
      }

      if (pathname === "/_litzjs/route" || pathname === "/_litzjs/action") {
        return await handleRouteRequest(
          request,
          manifest.routes ?? [],
          getContext,
          options.validateInternalRequest,
          (error, context) => options.onError?.(error, context),
          () => (contextLoaded ? contextValue : undefined),
          basePath,
        );
      }

      const apiResponse = await handleApiRequest(
        request,
        manifest.apiRoutes ?? [],
        getContext,
        basePath,
      );

      if (apiResponse) {
        return apiResponse;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        const assetResponse = await options.assets?.(request);

        if (assetResponse) {
          return toHeadResponseIfNeeded(request, assetResponse);
        }

        if (shouldServeDocument(request, pathname)) {
          const matchedRoute = hasMatchingDocumentRoute(manifest.routes ?? [], pathname);
          const primaryResponse = matchedRoute
            ? await createDocumentResponse(options.document, request, 200)
            : await createDocumentResponse(options.notFound, request, 404);

          if (primaryResponse) {
            return toHeadResponseIfNeeded(request, primaryResponse);
          }

          const fallbackDocumentResponse = !matchedRoute
            ? await createDocumentResponse(options.document, request, 200)
            : null;

          if (fallbackDocumentResponse) {
            return toHeadResponseIfNeeded(request, fallbackDocumentResponse);
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

  return { fetch: handle, __litzjsCreateServerOptions: options };
}

export function __withLitzRuntimeOptions<TContext = unknown>(
  server: LitzRuntimeServer<TContext>,
  options: CreateServerOptions<TContext>,
): LitzRuntimeServer<TContext> {
  if (!server.__litzjsCreateServerOptions) {
    throw new Error(
      [
        "[litzjs] The configured server entry must export a server created by createServer().",
        "Litz could not apply the generated base, document, and route manifest runtime options.",
      ].join(" "),
    );
  }

  const userOptions = server.__litzjsCreateServerOptions;

  return createServer({
    ...userOptions,
    ...options,
    app: userOptions.app,
    manifest: userOptions.app ? userOptions.manifest : options.manifest,
  });
}

function normalizeServerManifest(
  manifest: ServerManifest | undefined,
  app: LitzApp | undefined,
): ServerManifest {
  if (app && manifest) {
    throw new Error(
      "[litzjs] Pass either createServer({ app }) or createServer({ manifest }), not both.",
    );
  }

  const appManifest: ServerManifest | undefined = app
    ? {
        routes: app.routes.map((route) => ({
          id: route.id,
          path: route.path,
          route: route as RouteModule["route"],
        })),
        resources: app.resources.map((resource) => ({
          path: resource.path,
          resource: resource as ResourceModule["resource"],
        })),
        apiRoutes: app.apiRoutes.map((api) => ({
          path: api.path,
          api: api as ApiModule["api"],
        })),
      }
    : undefined;

  const resolvedManifest = appManifest ?? manifest;

  if (!resolvedManifest) {
    return {};
  }

  return {
    ...resolvedManifest,
    routes: resolvedManifest.routes ? sortByPathSpecificity(resolvedManifest.routes) : undefined,
    apiRoutes: resolvedManifest.apiRoutes
      ? sortByPathSpecificity(resolvedManifest.apiRoutes)
      : undefined,
  };
}

async function createDocumentResponse(
  document: DocumentResponseOption | undefined,
  request: Request,
  status: number,
): Promise<Response | null> {
  if (!document) {
    return null;
  }

  const resolvedDocument = typeof document === "function" ? await document(request) : document;

  if (!resolvedDocument) {
    return null;
  }

  if (typeof resolvedDocument === "string") {
    return new Response(request.method === "HEAD" ? null : resolvedDocument, {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  if (resolvedDocument instanceof Response) {
    return resolvedDocument.clone();
  }

  return new Response(request.method === "HEAD" ? null : String(resolvedDocument), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function hasMatchingDocumentRoute(routes: RouteModule[], pathname: string): boolean {
  return routes.some((route) => matchPathname(route.path, pathname) !== null);
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
  validateInternalRequest?: InternalRequestValidator<TContext>,
  reportError?: (error: unknown, context: TContext | undefined) => void,
  getLoadedContext?: () => TContext | undefined,
): Promise<Response> {
  let viewId = "litzjs#view";

  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await parseInternalRequestBody(request);
    const resourcePath = body.path;
    const operation = body.operation ?? "loader";
    const context = await getContext();
    const validationResponse = await validateInternalRequest?.({
      request,
      kind: "resource",
      operation,
      path: resourcePath,
      body,
      context,
    });

    if (validationResponse) {
      return validationResponse;
    }

    const entry = resources.find((resource) => resource.path === resourcePath);

    if (!resourcePath || !entry?.resource) {
      return createLitzJsonResponse(404, { kind: "fault", message: "Resource not found." });
    }

    const resource = entry.resource;
    const handler = operation === "action" ? resource.action : resource.loader;
    const middleware = resource.middleware ?? [];
    viewId = `${entry.path}#${operation}`;

    if (!handler) {
      return createLitzJsonResponse(405, {
        kind: "fault",
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
    const result = await runMiddlewareChain({
      middleware,
      request: normalizedRequest.request,
      params: normalizedRequest.params,
      signal,
      context,
      async execute(nextContext) {
        const input = await resolveValidatedInput({
          validation: resource.input,
          request: normalizedRequest.request,
          params: normalizedRequest.params,
          signal,
          context: nextContext,
        });

        return handler({
          request: normalizedRequest.request,
          params: normalizedRequest.params,
          signal,
          context: nextContext,
          input,
        });
      },
    });

    return createServerResultResponse(result, viewId);
  } catch (error) {
    if (isServerResultLike(error)) {
      return createServerResultResponse(error, viewId);
    }

    reportError?.(error, getLoadedContext?.());
    return createUnhandledFaultResponse();
  }
}

async function handleRouteRequest<TContext>(
  request: Request,
  routes: RouteModule[],
  getContext: () => Promise<TContext | undefined>,
  validateInternalRequest?: InternalRequestValidator<TContext>,
  reportError?: (error: unknown, context: TContext | undefined) => void,
  getLoadedContext?: () => TContext | undefined,
  base?: string,
): Promise<Response> {
  let viewId = "litzjs#view";

  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await parseInternalRequestBody(request);
    const routePath = body.path;
    const targetId = body.target;
    const targetIds = body.targets?.filter((value): value is string => typeof value === "string");
    const requestPathname = resolveBasePathname(new URL(request.url).pathname, base);
    const operation =
      body.operation ?? (requestPathname === "/_litzjs/action" ? "action" : "loader");
    const context = await getContext();
    const validationResponse = await validateInternalRequest?.({
      request,
      kind: "route",
      operation,
      path: routePath,
      body,
      context,
    });

    if (validationResponse) {
      return validationResponse;
    }

    const entry = routes.find((route) => route.path === routePath);

    if (!routePath || !entry?.route) {
      return createLitzJsonResponse(404, { kind: "fault", message: "Route not found." });
    }

    const route = entry.route;
    const chain = getRouteMatchChain(entry);
    const normalizedRequest = normalizeInternalRequest(
      request,
      routePath,
      body.request,
      body.payload,
    );
    const signal = request.signal;

    if (operation === "loader" && targetIds && targetIds.length > 0) {
      const batchTargets: RouteMatchEntry[] = [];

      for (const batchTargetId of targetIds) {
        const batchTarget = findTargetRouteMatch(chain, batchTargetId);

        if (!batchTarget) {
          return createLitzJsonResponse(404, { kind: "fault", message: "Route target not found." });
        }

        batchTargets.push(batchTarget);
      }

      const batchResults = await Promise.all(
        batchTargets.map((batchTarget) =>
          executeRouteTarget({
            route,
            operation,
            chain,
            target: batchTarget,
            normalizedRequest,
            signal,
            context,
          }),
        ),
      );
      const results: BatchedLoaderResponseEntry[] = [];

      for (const batchResult of batchResults) {
        const serializedResult = createBatchedLoaderResponseEntry(batchResult);

        if (!serializedResult) {
          return createLitzJsonResponse(409, {
            kind: "fault",
            message: "Batched route loaders do not support view results.",
          });
        }

        results.push(serializedResult);
      }

      return createLitzJsonResponse(200, {
        kind: "batch",
        results,
      });
    }

    const target =
      operation === "action"
        ? chain[chain.length - 1]
        : findTargetRouteMatch(chain, targetId ?? routePath);

    if (!target) {
      return createLitzJsonResponse(404, { kind: "fault", message: "Route target not found." });
    }

    viewId = `${target.id}#${operation}`;
    const result = await executeRouteTarget({
      route,
      operation,
      chain,
      target,
      normalizedRequest,
      signal,
      context,
    });

    return createServerResultResponse(result, viewId);
  } catch (error) {
    if (isServerResultLike(error)) {
      return createServerResultResponse(error, viewId);
    }

    reportError?.(error, getLoadedContext?.());
    return createUnhandledFaultResponse();
  }
}

async function handleApiRequest<TContext>(
  request: Request,
  apiRoutes: ApiModule[],
  getContext: () => Promise<TContext | undefined>,
  base?: string,
): Promise<Response | null> {
  try {
    const url = new URL(request.url);
    const pathname = resolveBasePathname(url.pathname, base);
    const matched = apiRoutes
      .map((candidate) => ({
        entry: candidate,
        params: matchPathname(candidate.path, pathname),
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

    return await runMiddlewareChain({
      middleware,
      request,
      params,
      signal,
      context,
      async execute(nextContext) {
        const input = await resolveValidatedInput({
          validation: matched.entry.api?.input,
          request,
          params,
          signal,
          context: nextContext,
        });

        return handler({
          request,
          params,
          signal,
          context: nextContext,
          input,
        });
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    if (isServerResultLike(error)) {
      return createApiResponseFromResult(error);
    }

    throw error;
  }
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

function getRouteMatchChain(entry: RouteModule): RouteMatchEntry[] {
  const layouts = collectLayouts(entry.route?.options?.layout);

  return [
    ...layouts.map((layout) => ({
      id: layout.id,
      path: layout.path,
      loader: layout.options?.loader,
      input: layout.options?.input,
      middleware: layout.options?.middleware ?? [],
    })),
    {
      id: entry.id,
      path: entry.path,
      loader: entry.route?.loader ?? entry.route?.options?.loader,
      input: entry.route?.options?.input,
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
  chain: RouteMatchEntry[],
  targetId: string,
): RouteMatchEntry | undefined {
  return chain.find((entry) => entry.id === targetId);
}

async function executeRouteTarget<TContext>(options: {
  route: NonNullable<RouteModule["route"]>;
  operation: "loader" | "action";
  chain: RouteMatchEntry[];
  target: RouteMatchEntry;
  normalizedRequest: {
    request: Request;
    params: Record<string, string>;
  };
  signal: AbortSignal;
  context: TContext | undefined;
}): Promise<unknown> {
  const targetIndex = options.chain.findIndex((candidate) => candidate.id === options.target.id);
  const handler =
    options.operation === "action"
      ? (options.route.action ?? options.route.options?.action)
      : options.target.loader;
  const validation =
    options.operation === "action" ? options.route.options?.input : options.target.input;

  if (!handler) {
    return {
      kind: "fault",
      status: 405,
      message: `Route does not define a ${options.operation}.`,
    };
  }

  const params =
    options.operation === "action"
      ? options.normalizedRequest.params
      : (extractRouteLikeParams(
          options.target.path,
          new URL(options.normalizedRequest.request.url).pathname,
        ) ?? options.normalizedRequest.params);

  return runMiddlewareChain({
    middleware: options.chain
      .slice(0, targetIndex + 1)
      .flatMap((candidate) => candidate.middleware),
    request: options.normalizedRequest.request,
    params,
    signal: options.signal,
    context: options.context,
    async execute(nextContext) {
      const input = await resolveValidatedInput({
        validation,
        request: options.normalizedRequest.request,
        params,
        signal: options.signal,
        context: nextContext,
      });

      return handler({
        request: options.normalizedRequest.request,
        params,
        signal: options.signal,
        context: nextContext,
        input,
      });
    },
  });
}

function createBatchedLoaderResponseEntry(result: unknown): BatchedLoaderResponseEntry | null {
  if (!result || typeof result !== "object" || !("kind" in result)) {
    return {
      status: 500,
      body: {
        kind: "fault",
        message: "Handler returned an unknown result.",
      },
    };
  }

  const serverResult = result as {
    kind: string;
    status?: number;
    headers?: HeadersInit;
    data?: unknown;
    location?: string;
    replace?: boolean;
    revalidate?: string[];
    message?: string;
    code?: string;
    digest?: string;
  };
  const headers = new Headers(serverResult.headers);
  applyRevalidateHeader(headers, serverResult.revalidate);
  const serializedHeaderEntries = Array.from(headers.entries());
  const serializedHeaders =
    serializedHeaderEntries.length > 0 ? serializedHeaderEntries : undefined;

  switch (serverResult.kind) {
    case "data":
      return {
        status: serverResult.status ?? 200,
        headers: serializedHeaders,
        body: {
          kind: "data",
          data: serverResult.data,
          revalidate: serverResult.revalidate ?? [],
        },
      };
    case "redirect":
      return {
        status: serverResult.status ?? 303,
        headers: serializedHeaders,
        body: {
          kind: "redirect",
          location: serverResult.location,
          replace: serverResult.replace ?? false,
          revalidate: serverResult.revalidate ?? [],
        },
      };
    case "error":
      return {
        status: serverResult.status ?? 500,
        headers: serializedHeaders,
        body: {
          kind: "error",
          message: serverResult.message ?? "Error",
          code: serverResult.code,
          data: serverResult.data,
        },
      };
    case "fault":
      return {
        status: serverResult.status ?? 500,
        headers: serializedHeaders,
        body: {
          kind: "fault",
          message: serverResult.message ?? "Fault",
          digest: serverResult.digest,
        },
      };
    case "view":
      return null;
    default:
      return {
        status: 500,
        body: {
          kind: "fault",
          message: `Unsupported result kind "${serverResult.kind}".`,
        },
      };
  }
}

async function createServerResultResponse(
  result: unknown,
  viewId = "litzjs#view",
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
      headers.set("x-litzjs-kind", "view");
      headers.set("x-litzjs-status", String(serverResult.status ?? 200));
      headers.set("x-litzjs-view-id", viewId);
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

  if (isBodyForbiddenStatus(status)) {
    return createBodylessResponse(status, responseHeaders);
  }

  responseHeaders.set("content-type", "application/vnd.litzjs.result+json");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function createUnhandledFaultResponse(): Response {
  return createLitzJsonResponse(500, {
    kind: "fault",
    message: "Internal server error.",
  });
}

function createBadRequestResponse(): Response {
  return new Response("Bad Request", {
    status: 400,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function applyRevalidateHeader(headers: Headers, revalidate?: string[]): void {
  if (!revalidate?.length) {
    return;
  }

  headers.set("x-litzjs-revalidate", revalidate.join(","));
}

function normalizeInternalRequest(
  originalRequest: Request,
  pathPattern: string,
  requestData:
    | {
        params?: Record<string, string>;
        search?: SearchParamRecord;
      }
    | undefined,
  payload: InternalRequestBody["payload"],
): {
  request: Request;
  params: Record<string, string>;
} {
  const params = requestData?.params ?? {};
  const search = createSearchParams(requestData?.search);
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

function shouldServeDocument(request: Request, pathname: string): boolean {
  if (pathname.startsWith("/_litzjs/") || pathname.startsWith("/api/")) {
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
