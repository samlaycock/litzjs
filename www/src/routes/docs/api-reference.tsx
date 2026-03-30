import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/api-reference", {
  component: ApiReference,
});

interface ExampleSpec {
  readonly code: string;
  readonly language?: string;
}

interface ReferenceEntrySpec {
  readonly name: string;
  readonly signature: string;
  readonly summary: string;
  readonly details?: readonly string[];
  readonly example?: ExampleSpec;
}

interface ReferenceGroupSpec {
  readonly title: string;
  readonly intro?: string;
  readonly entries: readonly ReferenceEntrySpec[];
}

const litzCoreGroups: readonly ReferenceGroupSpec[] = [
  {
    title: "Route, layout, resource, and API builders",
    intro:
      "These are the main entrypoints for declaring application structure and server behavior from `litzjs`.",
    entries: [
      {
        name: "defineRoute",
        signature: `defineRoute(path, options): LitzRoute<TPath, TContext, TLoaderResult, TActionResult, TInput>`,
        summary:
          "Declares a document route and returns a typed route object with hooks and helpers.",
        details: [
          "`options` is shaped by `DefineRouteOptions`, including `component`, `layout`, `input`, `loader`, `action`, `middleware`, `errorBoundary`, and `offline`.",
          "`route.useData()`, `route.useView()`, and `route.useError()` return the latest settled loader/action state for that route.",
          "`route.useStatus()` is page-scoped while the route result hooks stay route-scoped.",
        ],
        example: {
          language: "tsx",
          code: `import { data, defineRoute, invalid, server } from "litzjs";

export const route = defineRoute("/posts/:id/edit", {
  component: EditPostPage,
  loader: server(async ({ params }) => {
    return data({ postId: params.id });
  }),
  action: server(async ({ request }) => {
    const formData = await request.formData();

    if (!formData.get("title")) {
      return invalid({
        fields: { title: "Title is required" },
      });
    }

    return data({ saved: true });
  }),
});`,
        },
      },
      {
        name: "defineLayout",
        signature: `defineLayout(path, options): LitzLayout<TPath, TContext, TLoaderResult, TInput>`,
        summary: "Declares a layout boundary with optional loader, middleware, and fault handling.",
        details: [
          "`options` is shaped by `DefineLayoutOptions`, which matches route options except layouts do not declare actions or offline fallbacks.",
          "The returned layout object exposes route-like read hooks such as `useLoaderData()`, `useReload()`, `useParams()`, and `useSearch()`.",
        ],
      },
      {
        name: "defineResource",
        signature: `defineResource(path, options):
- { component }
- { component, loader }
- { component, action }
- { component, loader, action }`,
        summary:
          "Declares a reusable resource endpoint plus an optional bound React component and form helper.",
        details: [
          "The returned resource object exposes the same result hooks as routes, plus `resource.Component` and `resource.Form` inside the client runtime.",
          "`resource.useSearch()` uses `SetResourceSearchParams`, which only updates the resource query string and does not accept a `replace` option.",
        ],
        example: {
          language: "tsx",
          code: `import { data, defineResource, server } from "litzjs";

export const userCard = defineResource("/users/:id/card", {
  component: UserCard,
  loader: server(async ({ params }) => {
    return data({ userId: params.id });
  }),
});

function UserCard() {
  const data = userCard.useLoaderData();
  return <div>User {data?.userId}</div>;
}`,
        },
      },
      {
        name: "defineApiRoute",
        signature: `defineApiRoute(path, definition): LitzApiRoute<TPath, TContext, TInput, TMethods>`,
        summary:
          "Declares a raw HTTP endpoint and returns a typed object containing methods, input metadata, and a thin client-side `fetch(...)` helper.",
        details: [
          "`definition` is shaped by `DefineApiRouteOptions`, so it can include any subset of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, `ALL`, plus `middleware` and `input`.",
          "`api.fetch(...)` interpolates path params, serializes search params, and forwards the remaining `RequestInit` fields to the platform `fetch`.",
        ],
        example: {
          language: "ts",
          code: `import { defineApiRoute } from "litzjs";

export const api = defineApiRoute("/api/posts/:id", {
  async GET({ params }) {
    return Response.json({ id: params.id });
  },
});

const response = await api.fetch({
  params: { id: "42" },
});`,
        },
      },
      {
        name: "server",
        signature: `server(handler): ServerHandler<TContext, TResult> & { __litzServer?: true }`,
        summary:
          "Marks a route or resource handler as server-only without changing its runtime behavior.",
        details: [
          "Use it around loaders and actions so the bundler can keep that logic on the server side.",
          "The returned function is still the same callable handler shape; the marker is metadata for the framework.",
        ],
      },
    ],
  },
  {
    title: "Result helpers",
    intro:
      "These helpers create the `ServerResult` variants that route and resource loaders/actions return.",
    entries: [
      {
        name: "data",
        signature: `data<TData>(value: TData, options?: { headers?: HeadersInit; status?: number; revalidate?: string[] }): DataResult<TData>`,
        summary: "Returns structured data for loaders or actions.",
        details: [
          "`revalidate` lets an action trigger route or resource reloads after the result settles.",
        ],
      },
      {
        name: "view",
        signature: `view<TNode extends React.ReactNode>(node: TNode, options?: { headers?: HeadersInit; revalidate?: string[] }): ViewResult<TNode>`,
        summary: "Returns a rendered React node payload instead of JSON data.",
        details: [
          "Use this when the server should produce a view fragment instead of serializable data.",
        ],
      },
      {
        name: "invalid",
        signature: `invalid<TData = unknown>(options?: { headers?: HeadersInit; status?: number; fields?: Record<string, string>; formError?: string; data?: TData }): InvalidResult<TData>`,
        summary: "Returns validation feedback for form submissions.",
        details: [
          "`route.useInvalid()` and `resource.useInvalid()` read this branch directly from the latest action result.",
        ],
      },
      {
        name: "redirect",
        signature: `redirect(location: string, options?: { headers?: HeadersInit; status?: number; replace?: boolean; revalidate?: string[] }): RedirectResult`,
        summary: "Returns a redirect branch for loader or action flows.",
        details: [
          "`replace` controls client history replacement when the redirect is handled in the browser runtime.",
        ],
      },
      {
        name: "error",
        signature: `error<TData = unknown>(status: number, message: string, options?: { headers?: HeadersInit; code?: string; data?: TData }): ErrorResult<TData>`,
        summary: "Returns an expected application-level error result.",
        details: [
          "This is the branch read by `useLoaderError()`, `useActionError()`, and the merged `useError()` helpers.",
          "Use `error()` for domain failures you expect and want to expose to the route runtime.",
        ],
      },
      {
        name: "fault",
        signature: `fault(status: number, message: string, options?: { headers?: HeadersInit; digest?: string }): FaultResult`,
        summary: "Returns an unexpected runtime failure result.",
        details: [
          "Faults are distinct from explicit `error()` results and are the values passed to `errorBoundary` components.",
          "If a handler throws instead of returning a result, Litz normalizes that into the same fault-oriented flow.",
        ],
        example: {
          language: "tsx",
          code: `import { data, defineRoute, fault, server } from "litzjs";

export const route = defineRoute("/reports/:id", {
  component: ReportPage,
  loader: server(async ({ params }) => {
    const report = await loadReport(params.id);

    if (!report.backendHealthy) {
      return fault(503, "Reporting service unavailable", {
        digest: "reports-unavailable",
      });
    }

    return data(report);
  }),
});`,
        },
      },
      {
        name: "withHeaders",
        signature: `withHeaders<TResponse extends Response>(result: TResponse, headers: HeadersInit): TResponse
withHeaders<TResult extends { headers?: HeadersInit }>(result: TResult, headers: HeadersInit): TResult`,
        summary:
          "Merges additional headers onto an existing `Response` or framework result object.",
        details: ["Repeated `set-cookie` headers are appended instead of overwritten."],
        example: {
          language: "tsx",
          code: `import { data, withHeaders } from "litzjs";

return withHeaders(data({ ok: true }), {
  "cache-control": "no-store",
});`,
        },
      },
    ],
  },
  {
    title: "Form data and search param helpers",
    intro:
      "These exports support typed form submissions and search-param records without leaving the public `litzjs` surface.",
    entries: [
      {
        name: "formJson",
        signature: `formJson<T>(value: T): FormJsonValue<T>`,
        summary:
          "Wraps structured payloads so form submissions can encode JSON values inside `FormData`.",
        details: [
          "Use it when `useSubmit(...)`, `route.Form`, or `resource.Form` needs to send nested objects or arrays through multipart form data.",
        ],
        example: {
          language: "tsx",
          code: `import { formJson } from "litzjs";

function SaveFiltersButton() {
  const submit = route.useSubmit();

  return (
    <button
      onClick={() =>
        submit({
          title: "Hello",
          filters: formJson({ published: true, tags: ["docs"] }),
        })
      }
    >
      Save filters
    </button>
  );
}`,
        },
      },
      {
        name: "FormJsonValue",
        signature: `interface FormJsonValue<T = unknown> {
  readonly kind: "json";
  readonly value: T;
}`,
        summary: "The wrapper shape produced by `formJson(value)`.",
      },
      {
        name: "FormDataPayloadValue",
        signature: `type FormDataPayloadValue =
  | Blob
  | string
  | number
  | boolean
  | bigint
  | FormJsonValue
  | readonly FormDataPayloadValue[];`,
        summary:
          "All scalar and collection values accepted when submitting object payloads as form data.",
      },
      {
        name: "FormDataPayloadRecord",
        signature: `interface FormDataPayloadRecord {
  readonly [key: string]: FormDataPayloadValue;
}`,
        summary:
          "Dictionary shape accepted by `useSubmit(...)`, `route.Form`, and `resource.Form`.",
      },
      {
        name: "SubmitPayload",
        signature: `type SubmitPayload = FormData | FormDataPayloadRecord;`,
        summary: "Submission payload union used by route and resource action helpers.",
      },
      {
        name: "SearchParamValue",
        signature: `type SearchParamValue = string | string[];`,
        summary: "Single-value or repeated-value search parameter representation.",
      },
      {
        name: "SearchParamRecord",
        signature: `type SearchParamRecord = Record<string, SearchParamValue>;`,
        summary: "Object form accepted by APIs that build or update search params.",
      },
      {
        name: "SearchParamsUpdate",
        signature: `type SearchParamsUpdate = Record<string, string | string[] | null | undefined>;`,
        summary:
          "The mutable search update shape used by `SetSearchParams` and `SetResourceSearchParams`.",
      },
      {
        name: "SetSearchParams",
        signature: `type SetSearchParams = (
  params: SearchParamsUpdate,
  options?: { replace?: boolean },
) => void;`,
        summary: "Setter returned by route and layout `useSearch()` hooks.",
      },
      {
        name: "SetResourceSearchParams",
        signature: `type SetResourceSearchParams = (params: SearchParamsUpdate) => void;`,
        summary: "Setter returned by resource `useSearch()` hooks.",
      },
      {
        name: "LitzLocation",
        signature: `type LitzLocation = {
  href: string;
  pathname: string;
  search: URLSearchParams;
  hash: string;
};`,
        summary:
          "Normalized location object returned by both `litzjs` and `litzjs/client` location hooks.",
      },
    ],
  },
  {
    title: "Hook, result, and object shapes",
    intro:
      "These exports define what the framework returns at runtime once routes, layouts, and resources are declared.",
    entries: [
      {
        name: "useMatches",
        signature: `useMatches(): LitzMatch[]`,
        summary: "Returns the current matched route chain from `litzjs`.",
      },
      {
        name: "usePathname",
        signature: `usePathname(): string`,
        summary: "Returns the current pathname from `litzjs`.",
      },
      {
        name: "useLocation",
        signature: `useLocation(): LitzLocation`,
        summary: "Returns the current location object from `litzjs`.",
      },
      {
        name: "RouteStatus",
        signature: `type RouteStatus = "idle" | "loading" | "submitting" | "revalidating" | "offline-stale" | "error";`,
        summary: "Page/resource status enum used by route, layout, and resource status hooks.",
      },
      {
        name: "RouteErrorLike",
        signature: `type RouteErrorLike =
  | { kind: "error"; status: number; message: string; code?: string; data?: unknown }
  | { kind: "fault"; status: number; message: string; digest?: string };`,
        summary: "Common normalized error union used throughout route state.",
      },
      {
        name: "RouteExplicitErrorLike",
        signature: `type RouteExplicitErrorLike = Extract<RouteErrorLike, { kind: "error" }>;`,
        summary: "The explicit `error()` branch only.",
      },
      {
        name: "RouteFaultLike",
        signature: `type RouteFaultLike = Extract<RouteErrorLike, { kind: "fault" }>;`,
        summary: "The `fault()` branch used by error boundaries.",
      },
      {
        name: "RouteFormProps",
        signature: `type RouteFormProps = Omit<React.ComponentPropsWithoutRef<"form">, "action" | "method"> & { replace?: boolean; revalidate?: boolean | string[] };`,
        summary: "Props accepted by `route.Form` and `resource.Form`.",
        details: [
          "These helpers always target the owning route or resource action, so you provide form contents and submission flags rather than a raw `action` URL.",
        ],
      },
      {
        name: "SubmitOptions",
        signature: `type SubmitOptions<TResult extends ServerResult = ServerResult> = {
  onBeforeSubmit?: (formData: FormData) => void;
  onSuccess?: (result: ActionSuccessResultFor<TResult>) => void;
  onError?: (result: ActionErrorResultFor<TResult>) => void;
  replace?: boolean;
  revalidate?: boolean | string[];
};`,
        summary:
          "Runtime options accepted by `route.useSubmit(...)` and `resource.useSubmit(...)`.",
      },
      {
        name: "DataResult",
        signature: `type DataResult<TData = unknown> = {
  kind: "data";
  status?: number;
  headers?: HeadersInit;
  data: TData;
  revalidate?: string[];
};`,
        summary: "Raw result shape produced by `data(...)`.",
      },
      {
        name: "ViewResult",
        signature: `type ViewResult<TNode extends React.ReactNode = React.ReactNode> = {
  kind: "view";
  headers?: HeadersInit;
  node: TNode;
  revalidate?: string[];
};`,
        summary: "Raw result shape produced by `view(...)`.",
      },
      {
        name: "InvalidResult",
        signature: `type InvalidResult<TData = unknown> = {
  kind: "invalid";
  status?: number;
  headers?: HeadersInit;
  fields?: Record<string, string>;
  formError?: string;
  data?: TData;
};`,
        summary: "Raw result shape produced by `invalid(...)`.",
      },
      {
        name: "RedirectResult",
        signature: `type RedirectResult = {
  kind: "redirect";
  status?: number;
  headers?: HeadersInit;
  location: string;
  replace?: boolean;
  revalidate?: string[];
};`,
        summary: "Raw result shape produced by `redirect(...)`.",
      },
      {
        name: "ErrorResult",
        signature: `type ErrorResult<TData = unknown> = {
  kind: "error";
  status: number;
  headers?: HeadersInit;
  message: string;
  code?: string;
  data?: TData;
};`,
        summary: "Raw result shape produced by `error(...)`.",
      },
      {
        name: "FaultResult",
        signature: `type FaultResult = {
  kind: "fault";
  status: number;
  headers?: HeadersInit;
  message: string;
  digest?: string;
};`,
        summary: "Raw result shape produced by `fault(...)`.",
      },
      {
        name: "ServerResult",
        signature: `type ServerResult = DataResult<any> | ViewResult<any> | InvalidResult<any> | RedirectResult | ErrorResult<any> | FaultResult;`,
        summary:
          "Union of all framework result branches accepted from route and resource loaders/actions.",
      },
      {
        name: "NormalizedResult",
        signature: `type NormalizedResult =
  | { kind: "data"; status: number; headers: Headers; data: unknown; revalidate: string[] }
  | { kind: "view"; status: number; headers: Headers; node: React.ReactNode; revalidate: string[] }
  | { kind: "invalid"; status: number; headers: Headers; fields?: Record<string, string>; formError?: string; data?: unknown }
  | { kind: "redirect"; status: number; headers: Headers; location: string; replace: boolean; revalidate: string[] }
  | { kind: "error"; status: number; headers: Headers; message: string; code?: string; data?: unknown }
  | { kind: "fault"; status: number; headers: Headers; message: string; digest?: string };`,
        summary:
          "Internalized runtime result shape after defaults and header normalization have been applied.",
      },
      {
        name: "LoaderHookResultFor",
        signature: `type LoaderHookResultFor<TResult extends ServerResult = ServerResult> =
  | { kind: "data"; status: number; headers: Headers; stale: boolean; data: LoaderDataFor<TResult>; render(): React.ReactNode }
  | { kind: "view"; status: number; headers: Headers; stale: boolean; node: LoaderNodeFor<TResult> & React.ReactNode; render(): React.ReactNode }
  | { kind: "error"; status: number; headers: Headers; stale: boolean; message: string; code?: string; data?: ErrorDataFor<TResult> };`,
        summary:
          "Typed loader branch returned by `route.useLoaderResult()` and `resource.useLoaderResult()`.",
      },
      {
        name: "ActionHookResultFor",
        signature: `type ActionHookResultFor<TResult extends ServerResult = ServerResult> =
  | null
  | { kind: "invalid"; status: number; headers: Headers; fields?: Record<string, string>; formError?: string; data?: InvalidDataFor<TResult> }
  | { kind: "data"; status: number; headers: Headers; data: ActionDataFor<TResult> }
  | { kind: "view"; status: number; headers: Headers; node: ActionViewNodeFor<TResult> & React.ReactNode; render(): React.ReactNode }
  | { kind: "redirect"; status: number; headers: Headers; location: string; replace: boolean }
  | { kind: "error"; status: number; headers: Headers; message: string; code?: string; data?: ErrorDataFor<TResult> }
  | { kind: "fault"; status: number; headers: Headers; message: string; digest?: string };`,
        summary:
          "Typed action branch returned by `route.useActionResult()` and `resource.useActionResult()`.",
      },
      {
        name: "LoaderHookResult",
        signature: `type LoaderHookResult = LoaderHookResultFor<ServerResult>;`,
        summary: "Non-generic loader hook result convenience alias.",
      },
      {
        name: "ActionHookResult",
        signature: `type ActionHookResult = ActionHookResultFor<ServerResult>;`,
        summary: "Non-generic action hook result convenience alias.",
      },
      {
        name: "ActionErrorResultFor",
        signature: `type ActionErrorResultFor<TResult extends ServerResult = ServerResult> = Extract<ActionHookResultFor<TResult>, { kind: "error" | "fault" }>;`,
        summary: "Error-side branch used by `SubmitOptions.onError(...)`.",
      },
      {
        name: "ActionSuccessResultFor",
        signature: `type ActionSuccessResultFor<TResult extends ServerResult = ServerResult> = Exclude<ActionHookResultFor<TResult>, null | ActionErrorResultFor<TResult>>;`,
        summary: "Success-side branch used by `SubmitOptions.onSuccess(...)`.",
      },
      {
        name: "PathParams",
        signature: `type PathParams<TPath extends string> = string extends TPath ? Record<string, string> : Record<ExtractPathParamNames<TPath>, string>;`,
        summary: "Path-param inference for route, resource, and API path patterns.",
      },
      {
        name: "LitzMatch",
        signature: `type LitzMatch<TPath extends string = string> = {
  id: TPath;
  path: TPath;
  params: PathParams<TPath>;
  search: URLSearchParams;
};`,
        summary: "Matched route entry returned by `useMatches()`.",
      },
      {
        name: "LayoutReference",
        signature: `type LayoutReference = {
  id: string;
  path: string;
  component: React.JSXElementConstructor<{ children: React.ReactNode }>;
  options?: {
    layout?: LayoutReference;
    loader?: unknown;
    input?: unknown;
    middleware?: MiddlewareRef<any, ServerResult>[];
    errorBoundary?: React.ComponentType<{ error: RouteFaultLike }>;
  };
};`,
        summary:
          "Serializable layout reference used when nesting layouts or bootstrapping the client runtime.",
      },
      {
        name: "DefineRouteOptions",
        signature: `type DefineRouteOptions<TPath, TContext, TLoaderResult, TActionResult, TInput> = {
  component: React.ComponentType;
  layout?: LayoutReference;
  input?: TInput;
  loader?: RouteServerHandler<TContext, TLoaderResult, TPath, TInput>;
  action?: RouteServerHandler<TContext, TActionResult, TPath, TInput>;
  middleware?: MiddlewareRef<TContext, ServerResult>[];
  errorBoundary?: React.ComponentType<{ error: RouteFaultLike }>;
  offline?: {
    fallbackComponent?: React.ComponentType;
    preserveStaleOnFailure?: boolean;
  };
};`,
        summary: "Configuration shape accepted by `defineRoute(...)`.",
      },
      {
        name: "DefineLayoutOptions",
        signature: `type DefineLayoutOptions<TPath, TContext, TLoaderResult, TInput> = {
  component: React.JSXElementConstructor<{ children: React.ReactNode }>;
  layout?: LayoutReference;
  input?: TInput;
  loader?: RouteServerHandler<TContext, TLoaderResult, TPath, TInput>;
  middleware?: MiddlewareRef<TContext, ServerResult>[];
  errorBoundary?: React.ComponentType<{ error: RouteFaultLike }>;
};`,
        summary: "Configuration shape accepted by `defineLayout(...)`.",
      },
      {
        name: "LitzLayout",
        signature: `type LitzLayout<TPath, TContext, TLoaderResult, TInput> = {
  id: TPath;
  path: TPath;
  component: React.JSXElementConstructor<{ children: React.ReactNode }>;
  options: DefineLayoutOptions<TPath, TContext, TLoaderResult, TInput>;
  useParams(): PathParams<TPath>;
  useSearch(): [URLSearchParams, SetSearchParams];
  useStatus(): RouteStatus;
  usePending(): boolean;
  useLoaderResult?(): LoaderHookResultFor<TLoaderResult> | null;
  useLoaderData?(): unknown;
  useLoaderView?(): React.ReactNode | null;
  useLoaderError?(): RouteExplicitErrorLike | null;
  useData?(): unknown;
  useView?(): React.ReactNode | null;
  useReload?(): () => void;
};`,
        summary: "Returned layout object with loader and status hooks.",
      },
      {
        name: "LitzRoute",
        signature: `type LitzRoute<TPath, TContext, TLoaderResult, TActionResult, TInput> = {
  id: TPath;
  path: TPath;
  component: React.ComponentType;
  options: DefineRouteOptions<TPath, TContext, TLoaderResult, TActionResult, TInput>;
  useParams(): PathParams<TPath>;
  useSearch(): [URLSearchParams, SetSearchParams];
  useStatus(): RouteStatus;
  usePending(): boolean;
  useLoaderResult?(): LoaderHookResultFor<TLoaderResult> | null;
  useLoaderData?(): unknown;
  useLoaderView?(): React.ReactNode | null;
  useLoaderError?(): RouteExplicitErrorLike | null;
  useActionResult?(): ActionHookResultFor<TActionResult>;
  useActionData?(): unknown;
  useActionView?(): React.ReactNode | null;
  useActionError?(): RouteExplicitErrorLike | null;
  useInvalid?(): Extract<ActionHookResultFor<TActionResult>, { kind: "invalid" }> | null;
  useData(): unknown;
  useView(): React.ReactNode | null;
  useError(): RouteExplicitErrorLike | null;
  useReload?(): () => void;
  useSubmit?(options?: SubmitOptions<TActionResult>): (payload: SubmitPayload) => Promise<void>;
  Form?: React.ComponentType<RouteFormProps>;
};`,
        summary: "Returned route object with merged loader/action hooks and a bound form helper.",
        details: [
          "The `useData()`, `useView()`, and `useError()` helpers are always present and represent the latest settled route state.",
          "Action helpers only exist when the route declares an action; loader helpers only exist when the route declares a loader.",
        ],
      },
      {
        name: "ResourceRequest",
        signature: `type ResourceRequest<TPath extends string = string> = {
  params?: PathParams<TPath>;
  search?: URLSearchParams | SearchParamRecord;
};`,
        summary: "The request-like prop shape passed into `resource.Component`.",
        details: [
          "For resource paths with named or wildcard params, `params` becomes required in practice.",
        ],
      },
      {
        name: "ResourceComponentProps",
        signature: `type ResourceComponentProps<TPath extends string = string> = ResourceRequest<TPath>;`,
        summary: "Alias for the component prop type used by resource components.",
      },
      {
        name: "LitzApiRoute",
        signature: `type LitzApiRoute<TPath, TContext, TInput, TMethods> = {
  path: TPath;
  middleware?: MiddlewareRef<TContext, Response>[];
  input?: TInput;
  methods: TMethods;
  fetch(options?: ApiFetchOptions<TPath, TMethods>): Promise<Response>;
};`,
        summary: "Returned API route object with typed handlers and a fetch helper.",
        details: ["When the API path contains params, the `options.params` object is required."],
      },
      {
        name: "LitzResource",
        signature: `type LitzResource<TPath, TContext, TLoaderResult, TActionResult, TInput, TComponent> = {
  path: TPath;
  input?: TInput;
  middleware?: MiddlewareRef<TContext, ServerResult>[];
  component: TComponent;
  Component: React.ComponentType<ResourceComponentProps<TPath>>;
  useParams(): PathParams<TPath>;
  useSearch(): [URLSearchParams, SetResourceSearchParams];
  useStatus(): RouteStatus;
  usePending(): boolean;
  useLoaderResult?(): LoaderHookResultFor<TLoaderResult> | null;
  useActionResult?(): ActionHookResultFor<TActionResult>;
  useData(): unknown;
  useView(): React.ReactNode | null;
  useError(): RouteExplicitErrorLike | null;
  useReload?(): () => void;
  useSubmit?(options?: SubmitOptions<TActionResult>): (payload: SubmitPayload) => Promise<void>;
  Form?: React.ComponentType<RouteFormProps>;
};`,
        summary: "Returned resource object with bound component, form, and runtime hooks.",
        details: [
          "`resource.Component` and `resource.Form` are the public bridge between the declaration and the client runtime.",
        ],
      },
    ],
  },
  {
    title: "Middleware, input validation, and handler typing",
    intro:
      "These exports define the type-level contracts for middleware composition and validated handler inputs.",
    entries: [
      {
        name: "MiddlewareOverrides",
        signature: `type MiddlewareOverrides<TContext = unknown> = {
  context?: TContext;
};`,
        summary: "Optional context override passed from middleware into `next(...)`.",
      },
      {
        name: "MiddlewareContext",
        signature: `type MiddlewareContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext;
};`,
        summary: "Input passed into route/resource middleware handlers.",
      },
      {
        name: "MiddlewareNext",
        signature: `type MiddlewareNext<TContext = unknown, TResult = unknown> = (
  overrides?: MiddlewareOverrides<TContext>,
) => Promise<TResult>;`,
        summary: "Continuation function passed into middleware.",
      },
      {
        name: "MiddlewareHandler",
        signature: `type MiddlewareHandler<TContext = unknown, TResult = unknown> = (
  context: MiddlewareContext<TContext>,
  next: MiddlewareNext<TContext, TResult>,
) => TResult | Promise<TResult>;`,
        summary: "General middleware signature shared across route, resource, and API contexts.",
      },
      {
        name: "Middleware",
        signature: `type Middleware<TContext = unknown, TResult = ServerResult> = MiddlewareHandler<TContext, TResult>;`,
        summary: "Convenience alias for framework result middleware.",
      },
      {
        name: "MiddlewareRef",
        signature: `type MiddlewareRef<TContext = unknown, TResult = unknown> = MiddlewareHandler<TContext, TResult>;`,
        summary: "Reference type used by route, layout, resource, and API option objects.",
      },
      {
        name: "InputParserContext",
        signature: `interface InputParserContext<TContext = unknown, TPath extends string = string> {
  request: Request;
  params: PathParams<TPath>;
  signal: AbortSignal;
  context: TContext;
}`,
        summary: "Context object passed into input parser callbacks.",
      },
      {
        name: "InputValidationOptions",
        signature: `interface InputValidationOptions<TPath, TContext, TParams, TSearch, THeaders, TBody> {
  params?: (params: PathParams<TPath>, context: InputParserContext<TContext, TPath>) => Awaitable<TParams>;
  search?: (search: URLSearchParams, context: InputParserContext<TContext, TPath>) => Awaitable<TSearch>;
  headers?: (headers: Headers, context: InputParserContext<TContext, TPath>) => Awaitable<THeaders>;
  body?: (request: Request, context: InputParserContext<TContext, TPath>) => Awaitable<TBody>;
}`,
        summary:
          "Declarative parser map for validated params, search params, headers, and request bodies.",
        details: [
          "The return types of these callbacks flow into `ValidatedInput` and the route/resource/API handler contexts.",
        ],
        example: {
          language: "tsx",
          code: `import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/posts/:id", {
  component: PostPage,
  input: {
    params(params) {
      return { id: Number(params.id) };
    },
    search(search) {
      return { preview: search.get("preview") === "1" };
    },
  },
  loader: server(async ({ input }) => {
    return data(input);
  }),
});`,
        },
      },
      {
        name: "ValidatedInput",
        signature: `type ValidatedInput<TPath extends string = string, TInput extends InputValidationOptions<TPath, any, any, any, any, any> | undefined = undefined> = {
  params: PathParams<TPath> or the return type of input.params(...);
  search: URLSearchParams or the return type of input.search(...);
  headers: Headers or the return type of input.headers(...);
  body: undefined or the return type of input.body(...);
};`,
        summary: "Resolved handler input shape after all declared parsers have run.",
      },
      {
        name: "RouteHandlerContext",
        signature: `type RouteHandlerContext<TContext, TPath, TInput> = {
  request: Request;
  params: PathParams<TPath>;
  signal: AbortSignal;
  context: TContext;
  input: ValidatedInput<TPath, TInput>;
};`,
        summary: "Context passed into route loaders and actions.",
      },
      {
        name: "ResourceHandlerContext",
        signature: `type ResourceHandlerContext<TContext, TPath, TInput> = {
  request: Request;
  params: PathParams<TPath>;
  signal: AbortSignal;
  context: TContext;
  input: ValidatedInput<TPath, TInput>;
};`,
        summary: "Context passed into resource loaders and actions.",
      },
      {
        name: "ApiHandlerContext",
        signature: `type ApiHandlerContext<TContext, TPath, TInput> = {
  request: Request;
  params: PathParams<TPath>;
  signal: AbortSignal;
  context: TContext;
  input: ValidatedInput<TPath, TInput>;
};`,
        summary: "Context passed into API route method handlers.",
      },
      {
        name: "ApiRouteMethod",
        signature: `type ApiRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "ALL";`,
        summary: "All supported API method keys.",
      },
      {
        name: "ApiRouteHandler",
        signature: `type ApiRouteHandler<TContext, TPath, TInput> = (context: ApiHandlerContext<TContext, TPath, TInput>) => Promise<Response> | Response;`,
        summary: "Single typed API method handler.",
      },
      {
        name: "ApiRouteHandlers",
        signature: `type ApiRouteHandlers<TContext, TPath, TInput> = Partial<Record<ApiRouteMethod, ApiRouteHandler<TContext, TPath, TInput>>>;`,
        summary: "Dictionary of optional API handlers keyed by HTTP method.",
      },
      {
        name: "DefineApiRouteOptions",
        signature: `type DefineApiRouteOptions<TContext, TPath, TInput, TMethods> = TMethods & {
  middleware?: MiddlewareRef<TContext, Response>[];
  input?: TInput;
};`,
        summary: "Configuration shape accepted by `defineApiRoute(...)`.",
      },
      {
        name: "ApiFetchOptions",
        signature: `type ApiFetchOptions<TPath, TMethods> = Omit<RequestInit, "method"> & {
    params?: PathParams<TPath>;
    search?: URLSearchParams | SearchParamRecord;
    method?: ApiFetchMethod<TMethods>;
  };`,
        summary:
          "Options accepted by `api.fetch(...)`, including typed path params and allowed methods.",
        details: ["`method` is limited to the declared method keys, excluding `ALL`."],
      },
      {
        name: "RouteServerHandler",
        signature: `type RouteServerHandler<TContext, TResult, TPath, TInput> = (context: RouteHandlerContext<TContext, TPath, TInput>) => Promise<TResult> | TResult;`,
        summary: "Server handler shape for route loaders and actions.",
      },
      {
        name: "ResourceServerHandler",
        signature: `type ResourceServerHandler<TContext, TResult, TPath, TInput> = (context: ResourceHandlerContext<TContext, TPath, TInput>) => Promise<TResult> | TResult;`,
        summary: "Server handler shape for resource loaders and actions.",
      },
      {
        name: "ServerHandler",
        signature: `type ServerHandler<TContext = unknown, TResult extends ServerResult = ServerResult> = RouteServerHandler<TContext, TResult> | ResourceServerHandler<TContext, TResult>;`,
        summary: "Union of route and resource server handler signatures.",
      },
    ],
  },
];

const clientGroups: readonly ReferenceGroupSpec[] = [
  {
    title: "Client runtime exports",
    intro:
      "Import these from `litzjs/client` when wiring the browser runtime or consuming client-only navigation helpers directly.",
    entries: [
      {
        name: "MountAppOptions",
        signature: `interface MountAppOptions {
  readonly component?: React.JSXElementConstructor<{ children: React.ReactNode }>;
  readonly layout?: LayoutReference;
  readonly notFound?: React.ComponentType;
  readonly scrollRestoration?: boolean;
  readonly focusManagement?: boolean;
}`,
        summary: "Options accepted by `mountApp(...)`.",
      },
      {
        name: "mountApp",
        signature: `mountApp(element: Element, options?: MountAppOptions): void`,
        summary: "Mounts the Litz browser runtime into a DOM element.",
        details: [
          "`scrollRestoration` and `focusManagement` both default to `true` unless explicitly disabled.",
        ],
        example: {
          language: "tsx",
          code: `import { mountApp } from "litzjs/client";

mountApp(document.getElementById("root")!, {
  scrollRestoration: true,
  focusManagement: true,
});`,
        },
      },
      {
        name: "Link",
        signature: `const Link: React.ComponentType<React.ComponentPropsWithoutRef<"a"> & { href: string; replace?: boolean; prefetch?: boolean }>;`,
        summary: "Client-side navigation link component that wraps a normal anchor element.",
        details: [
          "Same-origin clicks are intercepted so navigation flows through the Litz runtime.",
        ],
      },
      {
        name: "useNavigate",
        signature: `useNavigate(): (href: string, options?: { replace?: boolean }) => void`,
        summary: "Returns an imperative navigation function.",
      },
      {
        name: "useMatches",
        signature: `useMatches(): Array<{ id: string; path: string; params: Record<string, string>; search: URLSearchParams }>`,
        summary: "Returns the active route match list from the client runtime.",
      },
      {
        name: "usePathname",
        signature: `usePathname(): string`,
        summary: "Returns the active pathname from the client runtime.",
      },
      {
        name: "useLocation",
        signature: `useLocation(): { href: string; pathname: string; search: URLSearchParams; hash: string }`,
        summary: "Returns the active location object from the client runtime.",
      },
    ],
  },
];

const serverGroups: readonly ReferenceGroupSpec[] = [
  {
    title: "Server runtime exports",
    intro:
      "Import these from `litzjs/server` when you are wiring the request handler into Bun, Node, Deno, or another WinterCG-style runtime.",
    entries: [
      {
        name: "CreateServerOptions",
        signature: `type CreateServerOptions<TContext = unknown> = {
  createContext?(request: Request): Promise<TContext> | TContext;
  onError?(error: unknown, context: TContext | undefined): void;
  manifest?: ServerManifest;
  document?: Response | string | ((request: Request) => Promise<Response | string | null | undefined> | Response | string | null | undefined);
  notFound?: Response | string | ((request: Request) => Promise<Response | string | null | undefined> | Response | string | null | undefined);
  assets?: (request: Request) => Promise<Response | null | undefined> | Response | null | undefined;
};`,
        summary: "Options accepted by `createServer(...)`.",
      },
      {
        name: "createServer",
        signature: `createServer<TContext = unknown>(options?: CreateServerOptions<TContext>): { fetch(request: Request): Promise<Response> }`,
        summary:
          "Creates the framework request handler that serves internal Litz endpoints, API routes, assets, and document responses.",
        details: [
          "The returned object is a fetch-style handler, so adapters can call `server.fetch(request)` directly.",
        ],
        example: {
          language: "ts",
          code: `import { createServer } from "litzjs/server";
import { serverManifest } from "virtual:litzjs:server-manifest";

const server = createServer({
  manifest: serverManifest,
  document: "<!doctype html><html><body><div id=\\"root\\"></div></body></html>",
});

export default {
  fetch(request: Request) {
    return server.fetch(request);
  },
};`,
        },
      },
    ],
  },
];

const viteGroups: readonly ReferenceGroupSpec[] = [
  {
    title: "Vite integration exports",
    intro:
      "Import these from `litzjs/vite`. Most apps only need `litz(...)`, but the helper exports are public and documented here because the package exports them.",
    entries: [
      {
        name: "LitzPluginOptions",
        signature: `type LitzPluginOptions = {
  routes?: string[];
  api?: string[];
  resources?: string[];
  server?: string;
  embedAssets?: boolean;
  rsc?: Omit<RscPluginOptions, "entries" | "serverHandler">;
};`,
        summary: "Options accepted by the main Vite plugin factory.",
      },
      {
        name: "litz",
        signature: `litz(options?: LitzPluginOptions): Plugin[]`,
        summary:
          "Creates the Litz Vite plugin stack, including route/resource/API discovery plus the `@vitejs/plugin-rsc` integration.",
        example: {
          language: "ts",
          code: `import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    ...litz({
      routes: ["src/routes/**/*.{ts,tsx}"],
      server: "src/server.ts",
    }),
  ],
});`,
        },
      },
      {
        name: "cleanupRscPluginArtifacts",
        signature: `cleanupRscPluginArtifacts(serverOutDir: string): void`,
        summary: "Deletes `__vite_rsc_*` artifacts from a built server output directory.",
        details: [
          "This is an advanced build helper. Most applications should rely on `litz(...)` to manage the build lifecycle instead of calling it directly.",
        ],
      },
      {
        name: "transformServerModuleSource",
        signature: `transformServerModuleSource(serverModuleSource: string): {
  source: string;
  handlerName: string;
}`,
        summary:
          "Rewrites the bundled server module so its default export is rebound to `__litzjsServerHandler` and can be re-exported safely.",
        details: [
          "This is another advanced helper intended for tooling and adapter authors rather than normal app code.",
        ],
      },
    ],
  },
];

function SignatureBlock({ signature }: { signature: string }) {
  return (
    <pre className="border border-neutral-800 bg-neutral-950/70 p-4 text-sm leading-6 text-sky-200 whitespace-pre-wrap overflow-x-auto mb-4">
      <code>{signature}</code>
    </pre>
  );
}

function ReferenceEntry({ entry }: { entry: ReferenceEntrySpec }) {
  return (
    <article className="border border-neutral-800 bg-neutral-900/40 p-6">
      <h4 className="text-lg font-semibold text-neutral-50 mb-3">{entry.name}</h4>
      <SignatureBlock signature={entry.signature} />
      <p className="text-neutral-300 mb-4">{entry.summary}</p>
      {entry.details?.length ? (
        <ul className="list-disc list-inside space-y-2 text-neutral-400 mb-4">
          {entry.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {entry.example ? (
        <CodeBlock language={entry.example.language} code={entry.example.code} />
      ) : null}
    </article>
  );
}

function ReferenceGroup({ group }: { group: ReferenceGroupSpec }) {
  return (
    <section className="mb-12">
      <h3 className="text-xl font-semibold text-neutral-100 mb-3">{group.title}</h3>
      {group.intro ? <p className="text-neutral-400 mb-6">{group.intro}</p> : null}
      <div className="space-y-6">
        {group.entries.map((entry) => (
          <ReferenceEntry key={entry.name} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function PackageSection({
  title,
  importPath,
  description,
  groups,
}: {
  title: string;
  importPath: string;
  description: string;
  groups: readonly ReferenceGroupSpec[];
}) {
  return (
    <section className="mb-16">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-3">{title}</h2>
        <p className="text-neutral-400 mb-3">{description}</p>
        <p className="text-sm text-neutral-500">
          Import from <code className="text-sky-400">{importPath}</code>.
        </p>
      </div>
      {groups.map((group) => (
        <ReferenceGroup key={group.title} group={group} />
      ))}
    </section>
  );
}

function ApiReference() {
  return (
    <>
      <title>API Reference | Litz</title>

      <h1 className="text-3xl font-bold text-neutral-50 mb-4">API Reference</h1>
      <p className="text-xl text-neutral-300 mb-4">
        Complete reference for all exports from litzjs, litzjs/client, litzjs/server, and
        litzjs/vite.
      </p>
      <p className="text-neutral-400 mb-8">
        This page is the authoritative API index for the public package surface. The source of truth
        is the package entrypoints in <code className="text-sky-400">src/index.ts</code>,{" "}
        <code className="text-sky-400">src/client/index.ts</code>,{" "}
        <code className="text-sky-400">src/server/index.ts</code>, and{" "}
        <code className="text-sky-400">src/vite.ts</code>.
      </p>

      <div className="border border-neutral-800 bg-neutral-900/40 p-6 mb-12">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Reading This Page</h2>
        <ul className="list-disc list-inside space-y-2 text-neutral-400">
          <li>Signatures and shapes mirror the public entrypoints rather than internal helpers.</li>
          <li>
            Route, layout, and resource hook families are documented on the returned object types
            because they are methods, not top-level exports.
          </li>
          <li>
            `error()` models expected application failures, while `fault()` models unexpected
            runtime failures that flow into error boundaries.
          </li>
          <li>
            `litzjs/vite` exposes advanced helpers in addition to `litz()`, so they are included
            here even though most application code will never call them directly.
          </li>
        </ul>
      </div>

      <PackageSection
        title="litzjs"
        importPath={`"litzjs"`}
        description="Core route, layout, resource, result, middleware, and type exports."
        groups={litzCoreGroups}
      />

      <PackageSection
        title="litzjs/client"
        importPath={`"litzjs/client"`}
        description="Browser-only runtime setup and navigation exports."
        groups={clientGroups}
      />

      <PackageSection
        title="litzjs/server"
        importPath={`"litzjs/server"`}
        description="WinterCG-style request handler exports for deployment adapters."
        groups={serverGroups}
      />

      <PackageSection
        title="litzjs/vite"
        importPath={`"litzjs/vite"`}
        description="Build-time Vite integration and advanced bundling helpers."
        groups={viteGroups}
      />

      <div className="flex justify-start pt-8 border-t border-neutral-800">
        <Link
          href="/docs/cloudflare-workers"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Cloudflare Workers
        </Link>
      </div>
    </>
  );
}
