import * as React from "react";

import { getClientBindings } from "./client/bindings";

export type MiddlewareOverrides<TContext = unknown> = {
  context?: TContext;
};

export type MiddlewareContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext;
};

export type MiddlewareNext<TContext = unknown, TResult = unknown> = (
  overrides?: MiddlewareOverrides<TContext>,
) => Promise<TResult>;

export type MiddlewareHandler<TContext = unknown, TResult = unknown> = (
  context: MiddlewareContext<TContext>,
  next: MiddlewareNext<TContext, TResult>,
) => TResult | Promise<TResult>;

export type Middleware<TContext = unknown, TResult = ServerResult> = MiddlewareHandler<
  TContext,
  TResult
>;

export type MiddlewareRef<TContext = unknown, TResult = unknown> = MiddlewareHandler<
  TContext,
  TResult
>;

export type RouteErrorLike =
  | {
      kind: "error";
      status: number;
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      status: number;
      message: string;
      digest?: string;
    };

export type RouteStatus =
  | "idle"
  | "loading"
  | "submitting"
  | "revalidating"
  | "offline-stale"
  | "error";

export type SubmitOptions<TResult extends ServerResult = ServerResult> = {
  onBeforeSubmit?: (formData: FormData) => void;
  onSuccess?: (result: ActionSuccessResultFor<TResult>) => void;
  onError?: (result: ActionErrorResultFor<TResult>) => void;
  replace?: boolean;
  revalidate?: boolean | string[];
};

export type SearchParamsUpdate = Record<string, string | string[] | null | undefined>;

export type VoltLocation = {
  href: string;
  pathname: string;
  search: URLSearchParams;
  hash: string;
};

export type SetSearchParams = (
  params: SearchParamsUpdate,
  options?: {
    replace?: boolean;
  },
) => void;

export type RouteFormProps = Omit<React.ComponentPropsWithoutRef<"form">, "action" | "method"> & {
  replace?: boolean;
  revalidate?: boolean | string[];
};

export type NormalizedResult =
  | {
      kind: "data";
      status: number;
      headers: Headers;
      data: unknown;
      revalidate: string[];
    }
  | {
      kind: "invalid";
      status: number;
      headers: Headers;
      fields?: Record<string, string>;
      formError?: string;
      data?: unknown;
    }
  | {
      kind: "redirect";
      status: number;
      headers: Headers;
      location: string;
      replace: boolean;
      revalidate: string[];
    }
  | {
      kind: "error";
      status: number;
      headers: Headers;
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      status: number;
      headers: Headers;
      message: string;
      digest?: string;
    };

export type DataResult<TData = unknown> = {
  kind: "data";
  status?: number;
  headers?: HeadersInit;
  data: TData;
  revalidate?: string[];
};

export type ViewResult<TNode extends React.ReactNode = React.ReactNode> = {
  kind: "view";
  headers?: HeadersInit;
  node: TNode;
  revalidate?: string[];
};

export type InvalidResult<TData = unknown> = {
  kind: "invalid";
  status?: number;
  headers?: HeadersInit;
  fields?: Record<string, string>;
  formError?: string;
  data?: TData;
};

export type RedirectResult = {
  kind: "redirect";
  status?: number;
  headers?: HeadersInit;
  location: string;
  replace?: boolean;
  revalidate?: string[];
};

export type ErrorResult<TData = unknown> = {
  kind: "error";
  status: number;
  headers?: HeadersInit;
  message: string;
  code?: string;
  data?: TData;
};

export type FaultResult = {
  kind: "fault";
  status: number;
  headers?: HeadersInit;
  message: string;
  digest?: string;
};

export type ServerResult =
  | DataResult<any>
  | ViewResult<any>
  | InvalidResult<any>
  | RedirectResult
  | ErrorResult<any>
  | FaultResult;

type ResultWithHeaders = {
  headers?: HeadersInit;
};

type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

type NoInferType<T> = [T][T extends any ? 0 : never];

type PresentResult<T> = [T] extends [never] ? never : T;

type ExtractPathParamName<TSegment extends string> = TSegment extends `${infer TParam}/${string}`
  ? TParam
  : TSegment extends `${infer TParam}?${string}`
    ? TParam
    : TSegment extends `${infer TParam}#${string}`
      ? TParam
      : TSegment;

type ExtractPathParamRest<TSegment extends string> = TSegment extends `${string}/${infer TRest}`
  ? TRest
  : never;

type ExtractPathParamNames<TPath extends string> = string extends TPath
  ? string
  : TPath extends `${string}:${infer TSegment}`
    ?
        | ExtractPathParamName<TSegment>
        | (ExtractPathParamRest<TSegment> extends never
            ? never
            : ExtractPathParamNames<ExtractPathParamRest<TSegment>>)
    : never;

export type PathParams<TPath extends string> = string extends TPath
  ? Record<string, string>
  : [ExtractPathParamNames<TPath>] extends [never]
    ? {}
    : Simplify<{
        [TKey in ExtractPathParamNames<TPath>]: string;
      }>;

type PathRequestParams<TPath extends string> = string extends TPath
  ? {
      params?: Record<string, string>;
    }
  : [ExtractPathParamNames<TPath>] extends [never]
    ? {
        params?: {};
      }
    : {
        params: PathParams<TPath>;
      };

type SearchRequest = {
  search?: URLSearchParams | Record<string, string>;
};

type HasRequiredPathParams<TPath extends string> = string extends TPath
  ? false
  : [ExtractPathParamNames<TPath>] extends [never]
    ? false
    : true;

type MaybeRequiredArg<TPath extends string, TValue> =
  HasRequiredPathParams<TPath> extends true ? [value: TValue] : [value?: TValue];

type LoaderDataFor<TResult extends ServerResult> =
  Extract<TResult, { kind: "data" }> extends { data: infer TData } ? TData : never;

type LoaderNodeFor<TResult extends ServerResult> =
  Extract<TResult, { kind: "view" }> extends { node: infer TNode } ? TNode : never;

type InvalidDataFor<TResult extends ServerResult> =
  Extract<TResult, { kind: "invalid" }> extends { data?: infer TData } ? TData : never;

type ActionDataFor<TResult extends ServerResult> =
  Extract<TResult, { kind: "data" }> extends { data: infer TData } ? TData : never;

type ActionViewNodeFor<TResult extends ServerResult> =
  Extract<TResult, { kind: "view" }> extends { node: infer TNode } ? TNode : never;

type ErrorDataFor<TResult extends ServerResult> =
  Extract<TResult, { kind: "error" }> extends { data?: infer TData } ? TData : never;

type LoaderDataHookBranch<TData> = {
  kind: "data";
  status: number;
  headers: Headers;
  stale: boolean;
  data: TData;
  render(this: void): React.ReactNode;
};

type LoaderViewHookBranch<TNode extends React.ReactNode> = {
  kind: "view";
  status: number;
  headers: Headers;
  stale: boolean;
  node: TNode;
  render(this: void): React.ReactNode;
};

type ActionInvalidHookBranch<TData> = {
  kind: "invalid";
  status: number;
  headers: Headers;
  fields?: Record<string, string>;
  formError?: string;
  data?: TData;
};

type ActionDataHookBranch<TData> = {
  kind: "data";
  status: number;
  headers: Headers;
  data: TData;
};

type ActionViewHookBranch<TNode extends React.ReactNode> = {
  kind: "view";
  status: number;
  headers: Headers;
  node: TNode;
  render(this: void): React.ReactNode;
};

type ActionRedirectHookBranch = {
  kind: "redirect";
  status: number;
  headers: Headers;
  location: string;
  replace: boolean;
};

type ActionErrorHookBranch<TData> = {
  kind: "error";
  status: number;
  headers: Headers;
  message: string;
  code?: string;
  data?: TData;
};

type ActionFaultHookBranch = {
  kind: "fault";
  status: number;
  headers: Headers;
  message: string;
  digest?: string;
};

export type LoaderHookResultFor<TResult extends ServerResult = ServerResult> =
  | PresentResult<
      Extract<TResult, { kind: "data" }> extends never
        ? never
        : LoaderDataHookBranch<LoaderDataFor<TResult>>
    >
  | PresentResult<
      Extract<TResult, { kind: "view" }> extends never
        ? never
        : LoaderViewHookBranch<LoaderNodeFor<TResult> & React.ReactNode>
    >;

export type ActionHookResultFor<TResult extends ServerResult = ServerResult> =
  | null
  | PresentResult<
      Extract<TResult, { kind: "invalid" }> extends never
        ? never
        : ActionInvalidHookBranch<InvalidDataFor<TResult>>
    >
  | PresentResult<
      Extract<TResult, { kind: "data" }> extends never
        ? never
        : ActionDataHookBranch<ActionDataFor<TResult>>
    >
  | PresentResult<
      Extract<TResult, { kind: "view" }> extends never
        ? never
        : ActionViewHookBranch<ActionViewNodeFor<TResult> & React.ReactNode>
    >
  | PresentResult<
      Extract<TResult, { kind: "redirect" }> extends never ? never : ActionRedirectHookBranch
    >
  | PresentResult<
      Extract<TResult, { kind: "error" }> extends never
        ? never
        : ActionErrorHookBranch<ErrorDataFor<TResult>>
    >
  | PresentResult<
      Extract<TResult, { kind: "fault" }> extends never ? never : ActionFaultHookBranch
    >;

export type LoaderHookResult = LoaderHookResultFor<ServerResult>;
export type ActionHookResult = ActionHookResultFor<ServerResult>;

type LoaderDataValueFor<TResult extends ServerResult> = LoaderDataFor<TResult> | null;
type LoaderViewValueFor<TResult extends ServerResult> =
  | (LoaderNodeFor<TResult> & React.ReactNode)
  | null;
type ActionDataValueFor<TResult extends ServerResult> = ActionDataFor<TResult> | null;
type ActionViewValueFor<TResult extends ServerResult> =
  | (ActionViewNodeFor<TResult> & React.ReactNode)
  | null;
type ActionInvalidValueFor<TResult extends ServerResult> = Extract<
  ActionHookResultFor<TResult>,
  { kind: "invalid" }
> | null;
type ActionExplicitErrorValueFor<TResult extends ServerResult> = Extract<
  ActionHookResultFor<TResult>,
  { kind: "error" }
> | null;
type MergedDataValueFor<TLoaderResult extends ServerResult, TActionResult extends ServerResult> =
  | LoaderDataFor<TLoaderResult>
  | ActionDataFor<TActionResult>
  | null;
type MergedViewValueFor<TLoaderResult extends ServerResult, TActionResult extends ServerResult> =
  | (LoaderNodeFor<TLoaderResult> & React.ReactNode)
  | (ActionViewNodeFor<TActionResult> & React.ReactNode)
  | null;

export type ActionErrorResultFor<TResult extends ServerResult = ServerResult> = Extract<
  ActionHookResultFor<TResult>,
  { kind: "error" | "fault" }
>;

export type ActionSuccessResultFor<TResult extends ServerResult = ServerResult> = Exclude<
  ActionHookResultFor<TResult>,
  null | ActionErrorResultFor<TResult>
>;

export type RouteHandlerContext<TContext = unknown, TPath extends string = string> = {
  request: Request;
  params: PathParams<TPath>;
  signal: AbortSignal;
  context: TContext;
};

export type ResourceHandlerContext<TContext = unknown, TPath extends string = string> = {
  request: Request;
  params: PathParams<TPath>;
  signal: AbortSignal;
  context: TContext;
};

export type ApiHandlerContext<TContext = unknown, TPath extends string = string> = {
  request: Request;
  params: PathParams<TPath>;
  signal: AbortSignal;
  context: TContext;
};

export type ApiRouteMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "ALL";

export type ApiRouteHandler<TContext = unknown, TPath extends string = string> = (
  context: ApiHandlerContext<TContext, TPath>,
) => Promise<Response> | Response;

export type ApiRouteHandlers<TContext = unknown, TPath extends string = string> = Partial<
  Record<ApiRouteMethod, ApiRouteHandler<TContext, TPath>>
>;

export type DefineApiRouteOptions<
  TContext = unknown,
  TPath extends string = string,
  TMethods extends ApiRouteHandlers<TContext, TPath> = ApiRouteHandlers<TContext, TPath>,
> = Simplify<
  TMethods & {
    middleware?: MiddlewareRef<NoInferType<TContext>, Response>[];
  }
>;

type ApiFetchMethod<TMethods extends ApiRouteHandlers<any, any>> = "ALL" extends keyof TMethods
  ? Exclude<ApiRouteMethod, "ALL">
  : Exclude<Extract<keyof TMethods, ApiRouteMethod>, "ALL">;

export type ApiFetchOptions<
  TPath extends string = string,
  TMethods extends ApiRouteHandlers<any, TPath> = ApiRouteHandlers<any, TPath>,
> = Omit<RequestInit, "method"> &
  PathRequestParams<TPath> &
  SearchRequest & {
    method?: ApiFetchMethod<TMethods>;
  };

export type RouteServerHandler<
  TContext = unknown,
  TResult extends ServerResult = ServerResult,
  TPath extends string = string,
> = (context: RouteHandlerContext<TContext, TPath>) => Promise<TResult> | TResult;

export type ResourceServerHandler<
  TContext = unknown,
  TResult extends ServerResult = ServerResult,
  TPath extends string = string,
> = (context: ResourceHandlerContext<TContext, TPath>) => Promise<TResult> | TResult;

export type ServerHandler<TContext = unknown, TResult extends ServerResult = ServerResult> =
  | RouteServerHandler<TContext, TResult>
  | ResourceServerHandler<TContext, TResult>;

export type DefineRouteOptions<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = ServerResult,
  TActionResult extends ServerResult = ServerResult,
> = {
  component: React.ComponentType;
  layout?: LayoutReference;
  loader?: RouteServerHandler<TContext, TLoaderResult, NoInferType<TPath>>;
  action?: RouteServerHandler<TContext, TActionResult, NoInferType<TPath>>;
  middleware?: MiddlewareRef<TContext, ServerResult>[];
  pendingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: RouteErrorLike }>;
  offline?: {
    fallbackComponent?: React.ComponentType;
    preserveStaleOnFailure?: boolean;
  };
};

type RouteBaseOptions<TPath extends string = string, TContext = unknown> = Omit<
  DefineRouteOptions<TPath, TContext, ServerResult, ServerResult>,
  "loader" | "action"
>;

type RouteLoaderOption<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = never,
> = [TLoaderResult] extends [never]
  ? {
      loader?: never;
    }
  : {
      loader: RouteServerHandler<TContext, TLoaderResult, TPath>;
    };

type RouteActionOption<
  TPath extends string = string,
  TContext = unknown,
  TActionResult extends ServerResult = never,
> = [TActionResult] extends [never]
  ? {
      action?: never;
    }
  : {
      action: RouteServerHandler<TContext, TActionResult, TPath>;
    };

export type DefineLayoutOptions<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = ServerResult,
> = {
  component: React.JSXElementConstructor<{ children: React.ReactNode }>;
  layout?: LayoutReference;
  loader?: RouteServerHandler<TContext, TLoaderResult, NoInferType<TPath>>;
  middleware?: MiddlewareRef<TContext, ServerResult>[];
  pendingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: RouteErrorLike }>;
};

type LayoutBaseOptions<TPath extends string = string, TContext = unknown> = Omit<
  DefineLayoutOptions<TPath, TContext, ServerResult>,
  "loader"
>;

type LayoutLoaderOption<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = never,
> = [TLoaderResult] extends [never]
  ? {
      loader?: never;
    }
  : {
      loader: RouteServerHandler<TContext, TLoaderResult, TPath>;
    };

export type VoltLayout<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = never,
> = Simplify<
  {
    id: TPath;
    path: TPath;
    component: React.JSXElementConstructor<{ children: React.ReactNode }>;
    options: LayoutBaseOptions<TPath, TContext> &
      LayoutLoaderOption<TPath, TContext, TLoaderResult>;
    useParams(): PathParams<TPath>;
    useSearch(): [URLSearchParams, SetSearchParams];
    useStatus(): RouteStatus;
    usePending(): boolean;
  } & ([TLoaderResult] extends [never] ? {} : LayoutLoaderClientHooks<TLoaderResult>)
>;

type LayoutReference = {
  id: string;
  path: string;
  component: React.JSXElementConstructor<{ children: React.ReactNode }>;
  options?: {
    layout?: LayoutReference;
    loader?: unknown;
    middleware?: MiddlewareRef<any, ServerResult>[];
    pendingComponent?: React.ComponentType;
    errorComponent?: React.ComponentType<{ error: RouteErrorLike }>;
  };
};

type LayoutLoaderClientHooks<TLoaderResult extends ServerResult> = {
  useLoaderResult(): LoaderHookResultFor<TLoaderResult> | null;
  useLoaderData(): LoaderDataValueFor<TLoaderResult>;
  useLoaderView(): LoaderViewValueFor<TLoaderResult>;
  useData(): LoaderDataValueFor<TLoaderResult>;
  useView(): LoaderViewValueFor<TLoaderResult>;
  useRetry(): () => void;
  useReload(): () => void;
};

type RouteLoaderClientHooks<TLoaderResult extends ServerResult> = {
  useLoaderResult(): LoaderHookResultFor<TLoaderResult> | null;
  useLoaderData(): LoaderDataValueFor<TLoaderResult>;
  useLoaderView(): LoaderViewValueFor<TLoaderResult>;
  useRetry(): () => void;
  useReload(): () => void;
};

type RouteActionClientHooks<TActionResult extends ServerResult> = {
  useActionResult(): ActionHookResultFor<TActionResult>;
  useActionData(): ActionDataValueFor<TActionResult>;
  useActionView(): ActionViewValueFor<TActionResult>;
  useActionError(): ActionExplicitErrorValueFor<TActionResult>;
  useInvalid(): ActionInvalidValueFor<TActionResult>;
  useSubmit(
    opts?: SubmitOptions<TActionResult>,
  ): (payload: FormData | Record<string, unknown>) => Promise<void>;
  Form: React.ComponentType<RouteFormProps>;
};

export type VoltRoute<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = never,
  TActionResult extends ServerResult = never,
> = Simplify<
  {
    id: TPath;
    path: TPath;
    component: React.ComponentType;
    options: RouteBaseOptions<TPath, TContext> &
      RouteLoaderOption<TPath, TContext, TLoaderResult> &
      RouteActionOption<TPath, TContext, TActionResult>;
    useParams(): PathParams<TPath>;
    useSearch(): [URLSearchParams, SetSearchParams];
    useStatus(): RouteStatus;
    usePending(): boolean;
  } & ([TLoaderResult] extends [never] ? {} : RouteLoaderClientHooks<TLoaderResult>) &
    ([TActionResult] extends [never] ? {} : RouteActionClientHooks<TActionResult>) &
    ([TLoaderResult] extends [never]
      ? [TActionResult] extends [never]
        ? {}
        : {
            useData(): ActionDataValueFor<TActionResult>;
            useView(): ActionViewValueFor<TActionResult>;
            useError(): ActionExplicitErrorValueFor<TActionResult>;
          }
      : [TActionResult] extends [never]
        ? {
            useData(): LoaderDataValueFor<TLoaderResult>;
            useView(): LoaderViewValueFor<TLoaderResult>;
          }
        : {
            useData(): MergedDataValueFor<TLoaderResult, TActionResult>;
            useView(): MergedViewValueFor<TLoaderResult, TActionResult>;
            useError(): ActionExplicitErrorValueFor<TActionResult>;
          })
>;

export type VoltMatch<TPath extends string = string> = {
  id: TPath;
  path: TPath;
  params: PathParams<TPath>;
  search: URLSearchParams;
};

export type ResourceLoaderState<
  TLoaderResult extends ServerResult = ServerResult,
  TPath extends string = string,
> =
  | {
      kind: undefined;
      data?: undefined;
      node?: undefined;
      render(this: void): React.ReactNode | null;
      load(request?: ResourceRequest<TPath>): Promise<void>;
    }
  | {
      kind: "data";
      data: LoaderDataFor<TLoaderResult>;
      node?: undefined;
      render(this: void): React.ReactNode | null;
      load(request?: ResourceRequest<TPath>): Promise<void>;
    }
  | {
      kind: "view";
      data?: undefined;
      node: LoaderNodeFor<TLoaderResult> & React.ReactNode;
      render(this: void): React.ReactNode | null;
      load(request?: ResourceRequest<TPath>): Promise<void>;
    };

export type ResourceActionState<TPath extends string = string> = {
  submit(
    payload: FormData | Record<string, unknown>,
    request?: ResourceRequest<TPath>,
  ): Promise<void>;
};

export type ResourceRequest<TPath extends string = string> = Simplify<
  PathRequestParams<TPath> & SearchRequest
>;

export type ResourceComponentProps<TPath extends string = string> = ResourceRequest<TPath>;

export type VoltApiRoute<
  TPath extends string = string,
  TContext = unknown,
  TMethods extends ApiRouteHandlers<TContext, TPath> = ApiRouteHandlers<TContext, TPath>,
> = {
  path: TPath;
  middleware?: MiddlewareRef<TContext, Response>[];
  methods: TMethods;
  fetch(...args: MaybeRequiredArg<TPath, ApiFetchOptions<TPath, TMethods>>): Promise<Response>;
};

export type VoltResource<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = never,
  TActionResult extends ServerResult = never,
  TComponent extends React.ComponentType<ResourceComponentProps<TPath>> = never,
> = Simplify<
  {
    path: TPath;
    middleware?: MiddlewareRef<TContext, ServerResult>[];
  } & ([TComponent] extends [never]
    ? {}
    : {
        component: TComponent;
        Component: TComponent;
      }) &
    ([TLoaderResult] extends [never]
      ? {}
      : {
          loader: ResourceServerHandler<TContext, TLoaderResult, TPath>;
          useLoader(
            ...args: MaybeRequiredArg<TPath, ResourceRequest<TPath>>
          ): ResourceLoaderState<TLoaderResult, TPath>;
        }) &
    ([TActionResult] extends [never]
      ? {}
      : {
          action: ResourceServerHandler<TContext, TActionResult, TPath>;
          useAction(
            ...args: MaybeRequiredArg<TPath, ResourceRequest<TPath>>
          ): ResourceActionState<TPath>;
        })
>;

type ResourceComponentOption<
  TPath extends string = string,
  TComponent extends React.ComponentType<ResourceComponentProps<TPath>> = never,
> = [TComponent] extends [never]
  ? {
      component?: never;
    }
  : {
      component: TComponent;
    };

type ResourceLoaderOption<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = never,
> = [TLoaderResult] extends [never]
  ? {
      loader?: never;
    }
  : {
      loader: ResourceServerHandler<TContext, TLoaderResult, TPath>;
    };

type ResourceActionOption<
  TPath extends string = string,
  TContext = unknown,
  TActionResult extends ServerResult = never,
> = [TActionResult] extends [never]
  ? {
      action?: never;
    }
  : {
      action: ResourceServerHandler<TContext, TActionResult, TPath>;
    };

type ResourceOptions<
  TPath extends string = string,
  TContext = unknown,
  TLoaderResult extends ServerResult = never,
  TActionResult extends ServerResult = never,
  TComponent extends React.ComponentType<ResourceComponentProps<TPath>> = never,
> = ResourceComponentOption<TPath, TComponent> &
  ResourceLoaderOption<TPath, TContext, TLoaderResult> &
  ResourceActionOption<TPath, TContext, TActionResult> & {
    middleware?: MiddlewareRef<TContext, ServerResult>[];
  };

function unimplementedHook(name: string): never {
  throw new Error(`${name} is not available until the Volt runtime is implemented.`);
}

function unimplementedResourceLoad(): Promise<void> {
  return Promise.reject(
    new Error(
      "resource.useLoader().load() is not available until the Volt runtime is implemented.",
    ),
  );
}

function unimplementedResourceSubmit(): Promise<void> {
  return Promise.reject(
    new Error(
      "resource.useAction().submit() is not available until the Volt runtime is implemented.",
    ),
  );
}

function UnimplementedForm(): never {
  throw new Error("route.Form is not available until the Volt runtime is implemented.");
}

function mergeHeaders(current: HeadersInit | undefined, next: HeadersInit): Headers {
  const merged = new Headers(current);
  const appended = new Headers(next);

  appended.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      merged.append(key, value);
      return;
    }

    merged.set(key, value);
  });

  return merged;
}

function getRequiredRouteLocation(path: string) {
  const bindings = getClientBindings();

  if (!bindings) {
    return unimplementedHook(`Route "${path}" location runtime`);
  }

  return bindings.useRequiredRouteLocation(path);
}

function getRequiredRouteStatus(path: string) {
  const bindings = getClientBindings();

  if (!bindings) {
    return unimplementedHook(`Route "${path}" status runtime`);
  }

  return bindings.useRequiredRouteStatus(path);
}

function getRequiredRouteData(path: string) {
  const bindings = getClientBindings();

  if (!bindings) {
    return unimplementedHook(`Route "${path}" data runtime`);
  }

  return bindings.useRequiredRouteData(path);
}

function getRequiredRouteActions(path: string) {
  const bindings = getClientBindings();

  if (!bindings) {
    return unimplementedHook(`Route "${path}" action runtime`);
  }

  return bindings.useRequiredRouteActions(path);
}

export function defineRoute<TContext = unknown, const TPath extends string = string>(
  path: TPath,
  options: RouteBaseOptions<NoInferType<TPath>, TContext> & {
    loader?: never;
    action?: never;
  },
): VoltRoute<TPath, TContext, never, never>;
export function defineRoute<
  TContext = unknown,
  const TPath extends string = string,
  TLoaderResult extends ServerResult = ServerResult,
>(
  path: TPath,
  options: RouteBaseOptions<NoInferType<TPath>, TContext> & {
    loader: RouteServerHandler<TContext, TLoaderResult, NoInferType<TPath>>;
    action?: never;
  },
): VoltRoute<TPath, TContext, TLoaderResult, never>;
export function defineRoute<
  TContext = unknown,
  const TPath extends string = string,
  TActionResult extends ServerResult = ServerResult,
>(
  path: TPath,
  options: RouteBaseOptions<NoInferType<TPath>, TContext> & {
    loader?: never;
    action: RouteServerHandler<TContext, TActionResult, NoInferType<TPath>>;
  },
): VoltRoute<TPath, TContext, never, TActionResult>;
export function defineRoute<
  TContext = unknown,
  const TPath extends string = string,
  TLoaderResult extends ServerResult = ServerResult,
  TActionResult extends ServerResult = ServerResult,
>(
  path: TPath,
  options: RouteBaseOptions<NoInferType<TPath>, TContext> & {
    loader: RouteServerHandler<TContext, TLoaderResult, NoInferType<TPath>>;
    action: RouteServerHandler<TContext, TActionResult, NoInferType<TPath>>;
  },
): VoltRoute<TPath, TContext, TLoaderResult, TActionResult>;
export function defineRoute(path: string, options: DefineRouteOptions<any, any, any>): any {
  return {
    id: path,
    path,
    component: options.component,
    options,
    useLoaderResult: () => {
      return getRequiredRouteData(path).loaderResult as LoaderHookResultFor<ServerResult> | null;
    },
    useLoaderData: () => {
      const loaderResult = getRequiredRouteData(path)
        .loaderResult as LoaderHookResultFor<ServerResult> | null;
      return loaderResult?.kind === "data" ? loaderResult.data : null;
    },
    useLoaderView: () => {
      const loaderResult = getRequiredRouteData(path)
        .loaderResult as LoaderHookResultFor<ServerResult> | null;
      return loaderResult?.kind === "view" ? loaderResult.node : null;
    },
    useData: () => getRequiredRouteData(path).data as unknown,
    useView: () => getRequiredRouteData(path).view as React.ReactNode | null,
    useError: () => {
      const actionResult = getRequiredRouteData(path)
        .actionResult as ActionHookResultFor<ServerResult>;
      return actionResult?.kind === "error" ? actionResult : null;
    },
    useActionResult: () =>
      getRequiredRouteData(path).actionResult as ActionHookResultFor<ServerResult>,
    useActionData: () => {
      const actionResult = getRequiredRouteData(path)
        .actionResult as ActionHookResultFor<ServerResult>;
      return actionResult?.kind === "data" ? actionResult.data : null;
    },
    useActionView: () => {
      const actionResult = getRequiredRouteData(path)
        .actionResult as ActionHookResultFor<ServerResult>;
      return actionResult?.kind === "view" ? actionResult.node : null;
    },
    useActionError: () => {
      const actionResult = getRequiredRouteData(path)
        .actionResult as ActionHookResultFor<ServerResult>;
      return actionResult?.kind === "error" ? actionResult : null;
    },
    useInvalid: () => {
      const actionResult = getRequiredRouteData(path)
        .actionResult as ActionHookResultFor<ServerResult>;
      return actionResult?.kind === "invalid" ? actionResult : null;
    },
    useStatus: () => getRequiredRouteStatus(path).status as RouteStatus,
    usePending: () => getRequiredRouteStatus(path).pending,
    useParams: () => getRequiredRouteLocation(path).params as PathParams<string>,
    useSearch: () => {
      const location = getRequiredRouteLocation(path);
      return [location.search, (params, options) => location.setSearch(params, options)] as [
        URLSearchParams,
        SetSearchParams,
      ];
    },
    useRetry: () => {
      const actions = getRequiredRouteActions(path);
      return () => actions.retry();
    },
    useReload: () => {
      const actions = getRequiredRouteActions(path);
      return () => actions.reload();
    },
    useSubmit: (opts?: SubmitOptions<ServerResult>) => {
      const actions = getRequiredRouteActions(path);
      return (payload: FormData | Record<string, unknown>) => actions.submit(payload, opts);
    },
    Form(props: RouteFormProps) {
      const bindings = getClientBindings();

      if (!bindings) {
        return React.createElement(UnimplementedForm, props);
      }

      const FormComponent = bindings.createRouteFormComponent(
        path,
      ) as React.ComponentType<RouteFormProps>;
      return React.createElement(FormComponent, props);
    },
  } as any;
}

export function defineLayout<TContext = unknown, const TPath extends string = string>(
  path: TPath,
  options: LayoutBaseOptions<NoInferType<TPath>, TContext> & {
    loader?: never;
  },
): VoltLayout<TPath, TContext, never>;
export function defineLayout<
  TContext = unknown,
  const TPath extends string = string,
  TLoaderResult extends ServerResult = ServerResult,
>(
  path: TPath,
  options: LayoutBaseOptions<NoInferType<TPath>, TContext> & {
    loader: RouteServerHandler<TContext, TLoaderResult, NoInferType<TPath>>;
  },
): VoltLayout<TPath, TContext, TLoaderResult>;
export function defineLayout(path: string, options: DefineLayoutOptions<any, any, any>): any {
  return {
    id: path,
    path,
    component: options.component,
    options,
    useLoaderResult: () => {
      return getRequiredRouteData(path).loaderResult as LoaderHookResultFor<ServerResult> | null;
    },
    useLoaderData: () => {
      const loaderResult = getRequiredRouteData(path)
        .loaderResult as LoaderHookResultFor<ServerResult> | null;
      return loaderResult?.kind === "data" ? loaderResult.data : null;
    },
    useLoaderView: () => {
      const loaderResult = getRequiredRouteData(path)
        .loaderResult as LoaderHookResultFor<ServerResult> | null;
      return loaderResult?.kind === "view" ? loaderResult.node : null;
    },
    useData: () => {
      const loaderResult = getRequiredRouteData(path)
        .loaderResult as LoaderHookResultFor<ServerResult> | null;
      return loaderResult?.kind === "data" ? loaderResult.data : null;
    },
    useView: () => getRequiredRouteData(path).view as React.ReactNode | null,
    useStatus: () => getRequiredRouteStatus(path).status as RouteStatus,
    usePending: () => getRequiredRouteStatus(path).pending,
    useParams: () => getRequiredRouteLocation(path).params as PathParams<string>,
    useSearch: () => {
      const location = getRequiredRouteLocation(path);
      return [location.search, (params, options) => location.setSearch(params, options)] as [
        URLSearchParams,
        SetSearchParams,
      ];
    },
    useRetry: () => {
      const actions = getRequiredRouteActions(path);
      return () => actions.retry();
    },
    useReload: () => {
      const actions = getRequiredRouteActions(path);
      return () => actions.reload();
    },
  } as any;
}

export function useMatches(): VoltMatch[] {
  const bindings = getClientBindings();

  if (!bindings) {
    return unimplementedHook("useMatches()");
  }

  return bindings.useMatches() as VoltMatch[];
}

export function usePathname(): string {
  const bindings = getClientBindings();

  if (!bindings) {
    return unimplementedHook("usePathname()");
  }

  return bindings.usePathname();
}

export function useLocation(): VoltLocation {
  const bindings = getClientBindings();

  if (!bindings) {
    return unimplementedHook("useLocation()");
  }

  return bindings.useLocation() as VoltLocation;
}

export function defineApiRoute<
  TContext = unknown,
  const TPath extends string = string,
  TMethods extends ApiRouteHandlers<TContext, TPath> = ApiRouteHandlers<TContext, TPath>,
>(
  path: TPath,
  definition: DefineApiRouteOptions<NoInferType<TContext>, NoInferType<TPath>, TMethods>,
): VoltApiRoute<TPath, TContext, TMethods> {
  const { middleware, ...methods } = definition as DefineApiRouteOptions<TContext, TPath, TMethods>;

  return {
    path,
    middleware,
    methods: methods as TMethods,
    fetch(...args: MaybeRequiredArg<TPath, ApiFetchOptions<TPath, TMethods>>) {
      const options = (args[0] ?? {}) as ApiFetchOptions<TPath, TMethods>;
      const { params, search, method, ...init } = options;
      const href = buildApiHref(path, params, search);

      return fetch(href, {
        ...init,
        method,
      });
    },
  };
}

export function defineResource<TContext = unknown, const TPath extends string = string>(
  path: TPath,
  options: ResourceOptions<NoInferType<TPath>, NoInferType<TContext>, never, never, never>,
): VoltResource<TPath, TContext, never, never, never>;
export function defineResource<
  TContext = unknown,
  const TPath extends string = string,
  TComponent extends React.ComponentType<ResourceComponentProps<TPath>> = React.ComponentType<
    ResourceComponentProps<TPath>
  >,
>(
  path: TPath,
  options: ResourceOptions<NoInferType<TPath>, NoInferType<TContext>, never, never, TComponent>,
): VoltResource<TPath, TContext, never, never, TComponent>;
export function defineResource<
  TContext = unknown,
  const TPath extends string = string,
  TLoaderResult extends ServerResult = ServerResult,
>(
  path: TPath,
  options: ResourceOptions<NoInferType<TPath>, NoInferType<TContext>, TLoaderResult, never, never>,
): VoltResource<TPath, TContext, TLoaderResult, never, never>;
export function defineResource<
  TContext = unknown,
  const TPath extends string = string,
  TActionResult extends ServerResult = ServerResult,
>(
  path: TPath,
  options: ResourceOptions<NoInferType<TPath>, NoInferType<TContext>, never, TActionResult, never>,
): VoltResource<TPath, TContext, never, TActionResult, never>;
export function defineResource<
  TContext = unknown,
  const TPath extends string = string,
  TLoaderResult extends ServerResult = ServerResult,
  TComponent extends React.ComponentType<ResourceComponentProps<TPath>> = React.ComponentType<
    ResourceComponentProps<TPath>
  >,
>(
  path: TPath,
  options: ResourceOptions<
    NoInferType<TPath>,
    NoInferType<TContext>,
    TLoaderResult,
    never,
    TComponent
  >,
): VoltResource<TPath, TContext, TLoaderResult, never, TComponent>;
export function defineResource<
  TContext = unknown,
  const TPath extends string = string,
  TActionResult extends ServerResult = ServerResult,
  TComponent extends React.ComponentType<ResourceComponentProps<TPath>> = React.ComponentType<
    ResourceComponentProps<TPath>
  >,
>(
  path: TPath,
  options: ResourceOptions<
    NoInferType<TPath>,
    NoInferType<TContext>,
    never,
    TActionResult,
    TComponent
  >,
): VoltResource<TPath, TContext, never, TActionResult, TComponent>;
export function defineResource<
  TContext = unknown,
  const TPath extends string = string,
  TLoaderResult extends ServerResult = ServerResult,
  TActionResult extends ServerResult = ServerResult,
>(
  path: TPath,
  options: ResourceOptions<
    NoInferType<TPath>,
    NoInferType<TContext>,
    TLoaderResult,
    TActionResult,
    never
  >,
): VoltResource<TPath, TContext, TLoaderResult, TActionResult, never>;
export function defineResource<
  TContext = unknown,
  const TPath extends string = string,
  TLoaderResult extends ServerResult = ServerResult,
  TActionResult extends ServerResult = ServerResult,
  TComponent extends React.ComponentType<ResourceComponentProps<TPath>> = React.ComponentType<
    ResourceComponentProps<TPath>
  >,
>(
  path: TPath,
  options: ResourceOptions<
    NoInferType<TPath>,
    NoInferType<TContext>,
    TLoaderResult,
    TActionResult,
    TComponent
  >,
): VoltResource<TPath, TContext, TLoaderResult, TActionResult, TComponent>;
export function defineResource(path: any, options: any): any {
  return {
    path,
    ...options,
    useLoader: (...args: MaybeRequiredArg<string, ResourceRequest<string>>) => {
      const request = args[0];
      const bindings = getClientBindings();

      if (!bindings) {
        return {
          kind: undefined,
          data: undefined,
          node: undefined,
          render: () => null,
          load: unimplementedResourceLoad,
        } as ResourceLoaderState<ServerResult, string>;
      }

      return bindings.useResourceLoader(path, request) as ResourceLoaderState<ServerResult, string>;
    },
    useAction: (...args: MaybeRequiredArg<string, ResourceRequest<string>>) => {
      const request = args[0];
      const bindings = getClientBindings();

      if (!bindings) {
        return {
          submit: unimplementedResourceSubmit,
        };
      }

      return bindings.useResourceAction(path, request) as ResourceActionState<string>;
    },
    Component: options.component,
  } as any;
}

export function server<
  TContext = unknown,
  TResult extends ServerResult = ServerResult,
  TPath extends string = string,
>(
  handler: (context: {
    request: Request;
    params: PathParams<NoInferType<TPath>>;
    signal: AbortSignal;
    context: NoInferType<TContext>;
  }) => Promise<TResult> | TResult,
): RouteServerHandler<TContext, TResult, TPath> {
  return handler;
}

export function withHeaders<TResponse extends Response>(
  result: TResponse,
  headers: HeadersInit,
): TResponse;
export function withHeaders<TResult extends ResultWithHeaders>(
  result: TResult,
  headers: HeadersInit,
): TResult;
export function withHeaders(result: Response | ResultWithHeaders, headers: HeadersInit) {
  if (result instanceof Response) {
    const mergedHeaders = mergeHeaders(result.headers, headers);

    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: mergedHeaders,
    });
  }

  return {
    ...result,
    headers: mergeHeaders(result.headers, headers),
  };
}

export function data<TData>(
  value: TData,
  options: {
    headers?: HeadersInit;
    status?: number;
    revalidate?: string[];
  } = {},
): DataResult<TData> {
  return {
    kind: "data",
    data: value,
    headers: options.headers,
    status: options.status,
    revalidate: options.revalidate,
  };
}

export function view<TNode extends React.ReactNode>(
  node: TNode,
  options: {
    headers?: HeadersInit;
    revalidate?: string[];
  } = {},
): ViewResult<TNode> {
  return {
    kind: "view",
    node,
    headers: options.headers,
    revalidate: options.revalidate,
  };
}

export function invalid<TData = unknown>(options: {
  headers?: HeadersInit;
  status?: number;
  fields?: Record<string, string>;
  formError?: string;
  data?: TData;
}): InvalidResult<TData> {
  return {
    kind: "invalid",
    headers: options.headers,
    status: options.status,
    fields: options.fields,
    formError: options.formError,
    data: options.data,
  };
}

export function redirect(
  location: string,
  options: {
    headers?: HeadersInit;
    status?: number;
    replace?: boolean;
    revalidate?: string[];
  } = {},
): RedirectResult {
  return {
    kind: "redirect",
    location,
    headers: options.headers,
    status: options.status,
    replace: options.replace,
    revalidate: options.revalidate,
  };
}

export function error<TData = unknown>(
  status: number,
  message: string,
  options: {
    headers?: HeadersInit;
    code?: string;
    data?: TData;
  } = {},
): ErrorResult<TData> {
  return {
    kind: "error",
    status,
    message,
    headers: options.headers,
    code: options.code,
    data: options.data,
  };
}

function buildApiHref(
  pathPattern: string,
  params?: Record<string, string>,
  search?: URLSearchParams | Record<string, string>,
): string {
  const pathname = pathPattern.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = params?.[key];

    if (value === undefined) {
      throw new Error(`Missing required API param "${key}" for path "${pathPattern}".`);
    }

    return encodeURIComponent(value);
  });

  const searchParams =
    search instanceof URLSearchParams
      ? new URLSearchParams(search)
      : new URLSearchParams(search ?? {});
  const searchString = searchParams.toString();

  return searchString ? `${pathname}?${searchString}` : pathname;
}
