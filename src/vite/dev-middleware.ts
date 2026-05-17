import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import type { Connect, ViteDevServer } from "vite";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ApiRouteMethod } from "../index";
import type { DiscoveredApiRoute, DiscoveredResource, DiscoveredRoute } from "./types";

import { resolveBasePathname } from "../base-path";
import {
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
} from "../path-matching";
import { createSearchParams, type SearchParamRecord } from "../search-params";
import { parseInternalRequestBody, type InternalRequestBody } from "../server/internal-requests";
import { createInternalHandlerHeaders } from "../server/request-headers";
import { toImportSpecifier } from "./paths";
import { LITZ_RSC_RENDERER_ID } from "./virtual-ids";

interface DevMiddlewareContext<TContext = unknown> {
  readonly request: Request;
  readonly params: Record<string, string>;
  readonly signal: AbortSignal;
  readonly context: TContext | undefined;
}

type DevMiddlewareNext<TContext = unknown, TResult = unknown> = (overrides?: {
  context?: TContext | undefined;
}) => Promise<TResult>;

type DevMiddlewareHandler<TContext = unknown, TResult = unknown> = (
  context: DevMiddlewareContext<TContext>,
  next: DevMiddlewareNext<TContext, TResult>,
) => Promise<TResult> | TResult;

interface DevRouteMatchEntry {
  readonly id: string;
  readonly path: string;
  readonly loader?: (context: unknown) => Promise<unknown>;
  readonly input?: RuntimeInputValidation;
  readonly middleware: DevMiddlewareHandler<unknown, unknown>[];
}

interface BatchedLoaderResponseEntry {
  readonly status: number;
  readonly headers?: Array<[string, string]>;
  readonly body: {
    readonly kind: "data" | "redirect" | "error" | "fault";
    readonly data?: unknown;
    readonly revalidate?: string[];
    readonly location?: string;
    readonly replace?: boolean;
    readonly message?: string;
    readonly code?: string;
    readonly digest?: string;
  };
}

function hasRunnableRscEnvironment(server: ViteDevServer): boolean {
  const env = server.environments.rsc as unknown as
    | {
        readonly runner?: unknown;
      }
    | undefined;

  return typeof env?.runner === "object" && env.runner !== null;
}

export async function handleLitzResourceRequest(
  server: ViteDevServer,
  manifest: DiscoveredResource[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  let viewId = "litzjs#view";
  const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;
  const pathname = requestUrl ? resolveBasePathname(requestUrl.pathname, base) : "/";

  if (!hasRunnableRscEnvironment(server)) {
    next();
    return;
  }

  if (pathname !== "/_litzjs/resource") {
    next();
    return;
  }

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end("Method Not Allowed");
    return;
  }

  try {
    const internalRequest = await createNodeRequest(request);
    const body = await parseInternalRequestBody(internalRequest);

    const resourcePath = body.path;
    const operation = body.operation ?? "loader";
    const entry = manifest.find((resource) => resource.path === resourcePath);

    if (!resourcePath || !entry) {
      sendLitzJson(response, 404, { kind: "fault", message: "Resource not found." });
      return;
    }

    const module = await loadLitzServerModule<{
      resource?: {
        loader?: (context: unknown) => Promise<unknown>;
        action?: (context: unknown) => Promise<unknown>;
        input?: RuntimeInputValidation;
        middleware?: DevMiddlewareHandler<unknown, unknown>[];
      };
    }>(server, toImportSpecifier(server.config.root, entry.modulePath));
    const resource = module.resource as
      | {
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        }
      | undefined;

    if (!resource) {
      sendLitzJson(response, 500, {
        kind: "fault",
        message: "Resource module did not export resource.",
      });
      return;
    }

    const handler = operation === "action" ? resource.action : resource.loader;
    viewId = `${entry.path}#${operation}`;

    if (!handler) {
      sendLitzJson(response, 405, {
        kind: "fault",
        message: `Resource does not define a ${operation}.`,
      });
      return;
    }

    const normalizedRequest = normalizeInternalResourceRequest(
      internalRequest,
      resourcePath,
      body.request,
      body.payload,
    );
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    const signal = controller.signal;
    const result = await runDevMiddlewareChain({
      middleware: resource.middleware ?? [],
      request: normalizedRequest.request,
      params: normalizedRequest.params,
      signal,
      context: undefined,
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

    await sendServerResult(server, response, result, viewId);
  } catch (error) {
    if (isServerResultLike(error)) {
      await sendServerResult(server, response, error, viewId);
      return;
    }

    server.ssrFixStacktrace(error as Error);
    console.error(error);
    sendLitzJson(response, 500, {
      kind: "fault",
      message: "Resource request failed.",
    });
  }
}

export async function handleLitzRouteRequest(
  server: ViteDevServer,
  manifest: DiscoveredRoute[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  let viewId = "litzjs#view";
  const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;
  const pathname = requestUrl ? resolveBasePathname(requestUrl.pathname, base) : "/";

  if (!hasRunnableRscEnvironment(server)) {
    next();
    return;
  }

  if (pathname !== "/_litzjs/route" && pathname !== "/_litzjs/action") {
    next();
    return;
  }

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end("Method Not Allowed");
    return;
  }

  try {
    const internalRequest = await createNodeRequest(request);
    const body = await parseInternalRequestBody(internalRequest);

    const routePath = body.path;
    const targetId = body.target;
    const targetIds = body.targets?.filter((value): value is string => typeof value === "string");
    const operation = body.operation ?? (pathname === "/_litzjs/action" ? "action" : "loader");
    const entry = manifest.find((route) => route.path === routePath);

    if (!routePath || !entry) {
      sendLitzJson(response, 404, { kind: "fault", message: "Route not found." });
      return;
    }

    const module = await loadLitzServerModule<{
      layout?: {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
      route?: {
        id?: string;
        path?: string;
        loader?: (context: unknown) => Promise<unknown>;
        action?: (context: unknown) => Promise<unknown>;
        options?: {
          layout?: {
            id: string;
            path: string;
            options?: {
              layout?: unknown;
              loader?: (context: unknown) => Promise<unknown>;
              input?: RuntimeInputValidation;
              middleware?: DevMiddlewareHandler<unknown, unknown>[];
            };
          };
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
    }>(server, toImportSpecifier(server.config.root, entry.modulePath));
    const route = module.route as
      | {
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          options?: {
            layout?: {
              id: string;
              path: string;
              options?: {
                layout?: unknown;
                loader?: (context: unknown) => Promise<unknown>;
                input?: RuntimeInputValidation;
                middleware?: DevMiddlewareHandler<unknown, unknown>[];
              };
            };
            loader?: (context: unknown) => Promise<unknown>;
            action?: (context: unknown) => Promise<unknown>;
            input?: RuntimeInputValidation;
            middleware?: DevMiddlewareHandler<unknown, unknown>[];
          };
        }
      | undefined;

    if (!route) {
      sendLitzJson(response, 500, { kind: "fault", message: "Route module did not export route." });
      return;
    }

    const chain = getDevRouteMatchChain({
      id: entry.id,
      path: entry.path,
      route,
    });
    const normalizedRequest = normalizeInternalResourceRequest(
      internalRequest,
      routePath,
      body.request,
      body.payload,
    );
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    const signal = controller.signal;

    if (operation === "loader" && targetIds && targetIds.length > 0) {
      const batchTargets: DevRouteMatchEntry[] = [];

      for (const batchTargetId of targetIds) {
        const batchTarget = findDevTargetRouteMatch(chain, batchTargetId);

        if (!batchTarget) {
          sendLitzJson(response, 404, { kind: "fault", message: "Route target not found." });
          return;
        }

        batchTargets.push(batchTarget);
      }

      const batchResults = await Promise.allSettled(
        batchTargets.map((batchTarget) =>
          executeDevRouteTarget({
            route,
            operation,
            chain,
            target: batchTarget,
            normalizedRequest,
            signal,
          }),
        ),
      );
      const results: BatchedLoaderResponseEntry[] = [];

      for (const batchResult of batchResults) {
        const serializedResult = createSettledDevBatchedLoaderResponseEntry(server, batchResult);

        results.push(serializedResult);
      }

      sendLitzJson(response, 200, {
        kind: "batch",
        results,
      });
      return;
    }

    const target =
      operation === "action"
        ? chain[chain.length - 1]
        : findDevTargetRouteMatch(chain, targetId ?? routePath);

    if (!target) {
      sendLitzJson(response, 404, { kind: "fault", message: "Route target not found." });
      return;
    }

    viewId = `${target.id}#${operation}`;
    const result = await executeDevRouteTarget({
      route,
      operation,
      chain,
      target,
      normalizedRequest,
      signal,
    });

    await sendServerResult(server, response, result, viewId);
  } catch (error) {
    if (isServerResultLike(error)) {
      await sendServerResult(server, response, error, viewId);
      return;
    }

    server.ssrFixStacktrace(error as Error);
    console.error(error);
    sendLitzJson(response, 500, {
      kind: "fault",
      message: "Route request failed.",
    });
  }
}

export async function handleLitzDocumentRequest(
  server: ViteDevServer,
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  const url = request.url ?? "/";
  const requestUrl = new URL(url, "http://litzjs.local");
  const pathname = resolveBasePathname(requestUrl.pathname, base);

  if (request.method !== "GET" && request.method !== "HEAD") {
    next();
    return;
  }

  if (
    pathname.startsWith("/_litzjs/") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/node_modules/")
  ) {
    next();
    return;
  }

  if (path.extname(pathname)) {
    next();
    return;
  }

  const accept = request.headers.accept ?? "";

  if (!accept.includes("text/html") && !accept.includes("*/*")) {
    next();
    return;
  }

  if (hasMalformedPathnameEncoding(requestUrl.pathname)) {
    sendBadRequest(response);
    return;
  }

  const templatePath = path.join(server.config.root, "index.html");
  let template: string;

  try {
    template = await readFile(templatePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      next();
      return;
    }

    server.ssrFixStacktrace(error as Error);
    next(error as Error);
    return;
  }

  try {
    const html = await server.transformIndexHtml(url, template);
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  } catch (error) {
    server.ssrFixStacktrace(error as Error);
    next(error as Error);
  }
}

export async function handleLitzApiRequest(
  server: ViteDevServer,
  manifest: DiscoveredApiRoute[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  const runnable = hasRunnableRscEnvironment(server);

  if (!runnable) {
    next();
    return;
  }

  const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;

  if (!requestUrl) {
    next();
    return;
  }

  const pathname = resolveBasePathname(requestUrl.pathname, base);

  if (hasMalformedPathnameEncoding(requestUrl.pathname)) {
    sendBadRequest(response);
    return;
  }

  const matched = manifest.find((entry) => matchPathPattern(entry.path, pathname));

  if (!matched) {
    next();
    return;
  }

  try {
    const module = await loadLitzServerModule<{
      api?: {
        input?: RuntimeInputValidation;
        middleware?: DevMiddlewareHandler<unknown, Response>[];
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
    }>(server, toImportSpecifier(server.config.root, matched.modulePath));
    const api = module.api;

    const method = (request.method ?? "GET").toUpperCase() as Exclude<ApiRouteMethod, "ALL">;
    const handler = api?.methods?.[method] ?? api?.methods?.ALL;
    const matchedParams = matchPathname(matched.path, requestUrl.pathname);

    if (!handler) {
      response.statusCode = 405;
      response.end("Method Not Allowed");
      return;
    }

    const apiRequest = await createNodeRequest(request, requestUrl);

    const controller = new AbortController();
    request.once("close", () => controller.abort());
    const signal = controller.signal;
    const apiResponse = await runDevMiddlewareChain({
      middleware: api?.middleware ?? [],
      request: apiRequest,
      params: matchedParams ?? {},
      signal,
      context: undefined,
      async execute(nextContext) {
        const input = await resolveValidatedInput({
          validation: api?.input,
          request: apiRequest,
          params: matchedParams ?? {},
          signal,
          context: nextContext,
        });

        return handler({
          request: apiRequest,
          params: matchedParams ?? {},
          signal,
          context: nextContext,
          input,
        });
      },
    });

    await writeFetchResponseToNode(response, apiResponse);
  } catch (error) {
    if (error instanceof Response) {
      await writeFetchResponseToNode(response, error);
      return;
    }

    if (isServerResultLike(error)) {
      await writeFetchResponseToNode(response, createApiResponseFromResult(error));
      return;
    }

    server.ssrFixStacktrace(error as Error);
    console.error(error);
    response.statusCode = 500;
    response.end("API route failed.");
  }
}

// ── Request / Response Utilities ──────────────────────────────────────────────
// Helpers for converting between Node.js IncomingMessage/ServerResponse and the
// Fetch API Request/Response types used by route handlers.

async function readRequestBuffer(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function createNodeRequest(
  request: IncomingMessage,
  url = createIncomingRequestUrl(request),
): Promise<Request> {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await readRequestBuffer(request);

  return new Request(url, {
    method: request.method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
}

function createIncomingRequestUrl(request: IncomingMessage): URL {
  const host =
    getForwardedRequestValue(request.headers["x-forwarded-host"]) ?? request.headers.host;
  const socket = request.socket as TLSSocket;
  const protocol =
    getForwardedRequestValue(request.headers["x-forwarded-proto"]) ??
    (socket.encrypted ? "https" : "http");

  return new URL(request.url ?? "/", `${protocol}://${host ?? "litzjs.local"}`);
}

function getForwardedRequestValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return undefined;
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);
}

function normalizeInternalResourceRequest(
  originalRequest: Request,
  resourcePath: string,
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
  url.pathname = interpolatePath(resourcePath, params, "resource");
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
      body,
    }),
    params,
  };
}

async function sendServerResult(
  server: ViteDevServer,
  response: ServerResponse,
  result: unknown,
  viewId = "litzjs#view",
): Promise<void> {
  if (!result || typeof result !== "object" || !("kind" in result)) {
    sendLitzJson(response, 500, {
      kind: "fault",
      message: "Handler returned an unknown result.",
    });
    return;
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

  applyHeaders(response, serverResult.headers);
  applyRevalidateHeader(response, serverResult.revalidate);

  switch (serverResult.kind) {
    case "data":
      sendLitzJson(response, serverResult.status ?? 200, {
        kind: "data",
        data: serverResult.data,
        revalidate: serverResult.revalidate ?? [],
      });
      return;
    case "invalid":
      sendLitzJson(response, serverResult.status ?? 422, {
        kind: "invalid",
        fields: serverResult.fields,
        formError: serverResult.formError,
        data: serverResult.data,
      });
      return;
    case "redirect":
      sendLitzJson(response, serverResult.status ?? 303, {
        kind: "redirect",
        location: serverResult.location,
        replace: serverResult.replace ?? false,
        revalidate: serverResult.revalidate ?? [],
      });
      return;
    case "error":
      sendLitzJson(response, serverResult.status ?? 500, {
        kind: "error",
        message: serverResult.message ?? "Error",
        code: serverResult.code,
        data: serverResult.data,
      });
      return;
    case "fault":
      sendLitzJson(response, serverResult.status ?? 500, {
        kind: "fault",
        message: serverResult.message ?? "Fault",
        digest: serverResult.digest,
      });
      return;
    case "view":
      const rscRenderer = await loadRscRenderer(server);
      const rscResponse = await rscRenderer.renderView(serverResult.node, {
        status: serverResult.status ?? 200,
        viewId,
        revalidate: serverResult.revalidate ?? [],
      });
      await writeFetchResponseToNode(response, rscResponse);
      return;
    default:
      sendLitzJson(response, 500, {
        kind: "fault",
        message: `Unsupported result kind "${serverResult.kind}".`,
      });
  }
}

async function loadLitzServerModule<T>(server: ViteDevServer, id: string): Promise<T> {
  const environment = getRscEnvironment(server);
  const resolved = await environment.pluginContainer.resolveId(id);

  if (!resolved) {
    throw new Error(`Failed to resolve Litz server module "${id}".`);
  }

  return environment.runner.import(resolved.id);
}

async function loadRscRenderer(server: ViteDevServer): Promise<{
  renderView(
    node: unknown,
    metadata?: { status?: number; viewId?: string; revalidate?: string[] },
  ): Promise<Response>;
}> {
  return loadLitzServerModule(server, LITZ_RSC_RENDERER_ID);
}

function getRscEnvironment(server: ViteDevServer): {
  pluginContainer: {
    resolveId(id: string): Promise<{ id: string } | null>;
  };
  runner: {
    import<T>(id: string): Promise<T>;
  };
} {
  return server.environments.rsc as unknown as {
    pluginContainer: {
      resolveId(id: string): Promise<{ id: string } | null>;
    };
    runner: {
      import<T>(id: string): Promise<T>;
    };
  };
}

// ── HTTP Response Helpers ────────────────────────────────────────────────────

function sendLitzJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = status;

  if (isBodyForbiddenStatus(status)) {
    response.removeHeader("content-type");
    response.end();
    return;
  }

  response.setHeader("content-type", "application/vnd.litzjs.result+json");
  response.end(JSON.stringify(body));
}

function sendBadRequest(response: ServerResponse): void {
  response.statusCode = 400;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end("Bad Request");
}

function applyHeaders(response: ServerResponse, headers?: HeadersInit): void {
  if (!headers) {
    return;
  }

  const normalized = new Headers(headers);

  normalized.forEach((value, key) => {
    response.setHeader(key, value);
  });
}

function applyRevalidateHeader(response: ServerResponse, revalidate?: string[]): void {
  if (!revalidate?.length) {
    return;
  }

  response.setHeader("x-litzjs-revalidate", revalidate.join(","));
}

async function writeFetchResponseToNode(
  response: ServerResponse,
  fetchResponse: Response,
): Promise<void> {
  response.statusCode = fetchResponse.status;

  fetchResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });

  if (!fetchResponse.body) {
    response.end();
    return;
  }

  const reader = fetchResponse.body.getReader();

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    response.write(Buffer.from(chunk.value));
  }

  response.end();
}

// ── Path & Route Matching ────────────────────────────────────────────────────
// Helpers for matching incoming request paths against route patterns, building
// layout chains, and extracting route parameters during development.

function matchPathPattern(pathPattern: string, pathname: string): boolean {
  return matchPathname(pathPattern, pathname) !== null;
}

function getDevRouteMatchChain(entry: {
  id: string;
  path: string;
  route: {
    loader?: (context: unknown) => Promise<unknown>;
    action?: (context: unknown) => Promise<unknown>;
    options?: {
      layout?: {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
      loader?: (context: unknown) => Promise<unknown>;
      input?: RuntimeInputValidation;
      middleware?: DevMiddlewareHandler<unknown, unknown>[];
    };
  };
}): DevRouteMatchEntry[] {
  const layouts = collectDevLayouts(entry.route.options?.layout);

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
      loader: entry.route.loader ?? entry.route.options?.loader,
      input: entry.route.options?.input,
      middleware: entry.route.options?.middleware ?? [],
    },
  ];
}

function collectDevLayouts(
  layout:
    | {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      }
    | undefined,
): Array<{
  id: string;
  path: string;
  options?: {
    layout?: unknown;
    loader?: (context: unknown) => Promise<unknown>;
    input?: RuntimeInputValidation;
    middleware?: DevMiddlewareHandler<unknown, unknown>[];
  };
}> {
  if (!layout) {
    return [];
  }

  const parent = isDevLayout(layout.options?.layout)
    ? collectDevLayouts(layout.options?.layout)
    : [];

  return [...parent, layout];
}

function isDevLayout(value: unknown): value is {
  id: string;
  path: string;
  options?: {
    layout?: unknown;
    loader?: (context: unknown) => Promise<unknown>;
    input?: RuntimeInputValidation;
    middleware?: DevMiddlewareHandler<unknown, unknown>[];
  };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "path" in value &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { path?: unknown }).path === "string"
  );
}

function findDevTargetRouteMatch<TEntry extends { id: string }>(
  chain: TEntry[],
  targetId: string,
): TEntry | undefined {
  return chain.find((entry) => entry.id === targetId);
}

async function executeDevRouteTarget(options: {
  route: {
    loader?: (context: unknown) => Promise<unknown>;
    action?: (context: unknown) => Promise<unknown>;
    options?: {
      layout?: {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
      loader?: (context: unknown) => Promise<unknown>;
      action?: (context: unknown) => Promise<unknown>;
      input?: RuntimeInputValidation;
      middleware?: DevMiddlewareHandler<unknown, unknown>[];
    };
  };
  operation: "loader" | "action";
  chain: DevRouteMatchEntry[];
  target: DevRouteMatchEntry;
  normalizedRequest: {
    request: Request;
    params: Record<string, string>;
  };
  signal: AbortSignal;
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

  return runDevMiddlewareChain({
    middleware: options.chain
      .slice(0, targetIndex + 1)
      .flatMap((candidate) => candidate.middleware),
    request: options.normalizedRequest.request,
    params,
    signal: options.signal,
    context: undefined,
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

function createDevBatchedLoaderResponseEntry(result: unknown): BatchedLoaderResponseEntry | null {
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
  if (serverResult.revalidate?.length) {
    headers.set("x-litzjs-revalidate", serverResult.revalidate.join(","));
  }
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

function createSettledDevBatchedLoaderResponseEntry(
  server: ViteDevServer,
  result: PromiseSettledResult<unknown>,
): BatchedLoaderResponseEntry {
  if (result.status === "rejected") {
    if (isServerResultLike(result.reason)) {
      return (
        createDevBatchedLoaderResponseEntry(result.reason) ?? createUnsupportedViewBatchFault()
      );
    }

    server.ssrFixStacktrace(result.reason as Error);
    console.error(result.reason);
    return createUnhandledBatchedLoaderFault();
  }

  return createDevBatchedLoaderResponseEntry(result.value) ?? createUnsupportedViewBatchFault();
}

function createUnsupportedViewBatchFault(): BatchedLoaderResponseEntry {
  return {
    status: 409,
    body: {
      kind: "fault",
      message: "Batched route loaders do not support view results.",
    },
  };
}

function createUnhandledBatchedLoaderFault(): BatchedLoaderResponseEntry {
  return {
    status: 500,
    body: {
      kind: "fault",
      message: "Route request failed.",
    },
  };
}

/**
 * Koa-style middleware dispatch. Recursively walks through `middleware` handlers
 * — each receives the current context and a `next()` function. Calling `next()`
 * invokes the next handler in the chain; the final handler calls `execute()`.
 * A guard prevents `next()` from being called more than once per handler.
 * Handlers can override the context for downstream middleware via `next({ context })`.
 */
async function runDevMiddlewareChain<TContext, TResult>(options: {
  middleware: DevMiddlewareHandler<TContext, TResult>[];
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext | undefined;
  execute(context: TContext | undefined): Promise<TResult> | TResult;
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
