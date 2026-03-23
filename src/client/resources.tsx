import * as React from "react";

import type {
  ActionHookResult,
  LoaderHookResult,
  ResourceComponentProps,
  ResourceRequest,
  RouteFormProps,
  RouteStatus,
  SetSearchParams,
  SubmitOptions,
} from "../index";

import { createFormDataPayload } from "../form-data";
import { createInternalActionRequestInit, VOLT_RESULT_ACCEPT } from "../server/internal-requests";
import { applySearchParams } from "./navigation";
import {
  isRedirectSignal,
  isRouteLikeError,
  parseActionResponse,
  parseLoaderResponse,
} from "./transport";

export type ResourceLocationState = {
  id: string;
  params: Record<string, string>;
  search: URLSearchParams;
  setSearch(
    this: void,
    params: Parameters<SetSearchParams>[0],
    options?: Parameters<SetSearchParams>[1],
  ): void;
};

export type ResourceStatusState = {
  id: string;
  status: RouteStatus;
  pending: boolean;
};

export type ResourceDataState = {
  id: string;
  loaderResult: LoaderHookResult | null;
  actionResult: ActionHookResult;
  data: unknown;
  view: React.ReactNode | null;
};

export type ResourceActionsState = {
  id: string;
  submit(
    this: void,
    payload: FormData | Record<string, unknown>,
    options?: SubmitOptions,
  ): Promise<void>;
  reload(this: void): void;
  retry(this: void): void;
};

export type ResourceRuntimeState = ResourceLocationState &
  ResourceStatusState &
  ResourceDataState &
  ResourceActionsState;

type ResourceSnapshot = {
  loaderResult: LoaderHookResult | null;
  actionResult: ActionHookResult;
  data: unknown;
  view: React.ReactNode | null;
  status: RouteStatus;
  pending: boolean;
  failure?: unknown;
};

type ResourceStoreEntry = {
  snapshot: ResourceSnapshot;
  listeners: Set<() => void>;
  inFlight?: Promise<NonNullable<ActionHookResult> | LoaderHookResult | void>;
};

type NormalizedResourceRequest = {
  params: Record<string, string>;
  search: Record<string, string>;
};

type PreparedResourceRequest = {
  key: string;
  normalizedRequest: NormalizedResourceRequest;
};

const RESOURCE_STORE_LIMIT = 200;
const resourceStore = new Map<string, ResourceStoreEntry>();
const resourceFormComponentCache = new Map<string, React.ComponentType<RouteFormProps>>();
const resourceComponentCache = new Map<string, React.ComponentType<any>>();

let resourceLocationContext: React.Context<ResourceLocationState | null> | null = null;
let resourceStatusContext: React.Context<ResourceStatusState | null> | null = null;
let resourceDataContext: React.Context<ResourceDataState | null> | null = null;
let resourceActionsContext: React.Context<ResourceActionsState | null> | null = null;

function createRuntimeContext<T>(name: string): React.Context<T | null> {
  const createContext = (
    React as typeof React & {
      createContext?: typeof React.createContext;
    }
  ).createContext;

  if (!createContext) {
    throw new Error(`${name} is not available in this environment.`);
  }

  return createContext<T | null>(null);
}

function getResourceLocationContext(): React.Context<ResourceLocationState | null> {
  resourceLocationContext ??= createRuntimeContext<ResourceLocationState>("Volt resource location");
  return resourceLocationContext;
}

function getResourceStatusContext(): React.Context<ResourceStatusState | null> {
  resourceStatusContext ??= createRuntimeContext<ResourceStatusState>("Volt resource status");
  return resourceStatusContext;
}

function getResourceDataContext(): React.Context<ResourceDataState | null> {
  resourceDataContext ??= createRuntimeContext<ResourceDataState>("Volt resource data");
  return resourceDataContext;
}

function getResourceActionsContext(): React.Context<ResourceActionsState | null> {
  resourceActionsContext ??= createRuntimeContext<ResourceActionsState>("Volt resource actions");
  return resourceActionsContext;
}

function requireActiveResourceSlice<T extends { id: string }>(
  resourcePath: string,
  value: T | null,
): T {
  if (!value) {
    throw new Error(`Resource "${resourcePath}" is being used outside its resource component.`);
  }

  if (value.id !== resourcePath) {
    throw new Error(
      `Resource "${resourcePath}" is not the active resource. Active resource is "${value.id}".`,
    );
  }

  return value;
}

export function ResourceRuntimeProvider(props: {
  value: ResourceRuntimeState;
  children?: React.ReactNode;
}): React.ReactElement {
  const ResourceLocationContext = getResourceLocationContext();
  const ResourceStatusContext = getResourceStatusContext();
  const ResourceDataContext = getResourceDataContext();
  const ResourceActionsContext = getResourceActionsContext();
  const locationValue = React.useMemo(
    () => ({
      id: props.value.id,
      params: props.value.params,
      search: props.value.search,
      setSearch: props.value.setSearch,
    }),
    [props.value.id, props.value.params, props.value.search, props.value.setSearch],
  );
  const statusValue = React.useMemo(
    () => ({
      id: props.value.id,
      status: props.value.status,
      pending: props.value.pending,
    }),
    [props.value.id, props.value.pending, props.value.status],
  );
  const dataValue = React.useMemo(
    () => ({
      id: props.value.id,
      loaderResult: props.value.loaderResult,
      actionResult: props.value.actionResult,
      data: props.value.data,
      view: props.value.view,
    }),
    [
      props.value.actionResult,
      props.value.data,
      props.value.id,
      props.value.loaderResult,
      props.value.view,
    ],
  );
  const actionsValue = React.useMemo(
    () => ({
      id: props.value.id,
      submit: props.value.submit,
      reload: props.value.reload,
      retry: props.value.retry,
    }),
    [props.value.id, props.value.reload, props.value.retry, props.value.submit],
  );

  return (
    <ResourceLocationContext.Provider value={locationValue}>
      <ResourceStatusContext.Provider value={statusValue}>
        <ResourceDataContext.Provider value={dataValue}>
          <ResourceActionsContext.Provider value={actionsValue}>
            {props.children}
          </ResourceActionsContext.Provider>
        </ResourceDataContext.Provider>
      </ResourceStatusContext.Provider>
    </ResourceLocationContext.Provider>
  );
}

export function useRequiredResourceLocation(resourcePath: string): ResourceLocationState {
  return requireActiveResourceSlice(resourcePath, React.useContext(getResourceLocationContext()));
}

export function useRequiredResourceStatus(resourcePath: string): ResourceStatusState {
  return requireActiveResourceSlice(resourcePath, React.useContext(getResourceStatusContext()));
}

export function useRequiredResourceData(resourcePath: string): ResourceDataState {
  return requireActiveResourceSlice(resourcePath, React.useContext(getResourceDataContext()));
}

export function useRequiredResourceActions(resourcePath: string): ResourceActionsState {
  return requireActiveResourceSlice(resourcePath, React.useContext(getResourceActionsContext()));
}

export function createResourceFormComponent(
  resourcePath: string,
): React.ComponentType<RouteFormProps> {
  const cached = resourceFormComponentCache.get(resourcePath);

  if (cached) {
    return cached;
  }

  const VoltResourceForm = function VoltResourceForm(props: RouteFormProps): React.ReactElement {
    const actions = useRequiredResourceActions(resourcePath);
    const { children, onSubmit, replace, revalidate, ...rest } = props;
    const submitRef = React.useRef(
      (payload: FormData | Record<string, unknown>, options?: SubmitOptions) =>
        actions.submit(payload, options),
    );

    React.useEffect(() => {
      submitRef.current = (payload: FormData | Record<string, unknown>, options?: SubmitOptions) =>
        actions.submit(payload, options);
    }, [actions.submit]);

    const action = React.useCallback(
      async (formData: FormData) => {
        await submitRef.current(formData, {
          replace,
          revalidate,
        });
      },
      [replace, revalidate],
    );

    return React.createElement(
      "form",
      {
        ...rest,
        action,
        onSubmit,
      },
      children,
    );
  };

  const MemoizedVoltResourceForm = React.memo(VoltResourceForm);
  MemoizedVoltResourceForm.displayName = `VoltResourceForm(${resourcePath})`;
  resourceFormComponentCache.set(resourcePath, MemoizedVoltResourceForm);
  return MemoizedVoltResourceForm;
}

export function createResourceComponent<
  TProps extends ResourceComponentProps = ResourceComponentProps,
>(resourcePath: string, Component: React.ComponentType<TProps>): React.ComponentType<TProps> {
  const cached = resourceComponentCache.get(resourcePath);

  if (cached) {
    return cached as React.ComponentType<TProps>;
  }

  const VoltResourceComponent = function VoltResourceComponent(props: TProps): React.ReactElement {
    const runtime = useResourceRuntime(resourcePath, props);

    return (
      <ResourceRuntimeProvider value={runtime}>
        <Component {...props} />
      </ResourceRuntimeProvider>
    );
  };

  const MemoizedVoltResourceComponent = React.memo(VoltResourceComponent);
  MemoizedVoltResourceComponent.displayName = `VoltResource(${resourcePath})`;
  resourceComponentCache.set(resourcePath, MemoizedVoltResourceComponent);
  return MemoizedVoltResourceComponent;
}

function useResourceRuntime(resourcePath: string, request?: ResourceRequest): ResourceRuntimeState {
  const params = React.useMemo(() => request?.params ?? {}, [request?.params]);
  const incomingSearchKey = React.useMemo(
    () => createUrlSearchParams(request?.search).toString(),
    [request?.search],
  );
  const [searchState, setSearchState] = React.useState(() =>
    createUrlSearchParams(request?.search),
  );

  React.useEffect(() => {
    setSearchState((current) =>
      current.toString() === incomingSearchKey ? current : createUrlSearchParams(request?.search),
    );
  }, [incomingSearchKey, request?.search]);

  const preparedRequest = React.useMemo(
    () => prepareResourceRequest(resourcePath, { params, search: searchState }),
    [params, resourcePath, searchState],
  );
  const snapshot = React.useSyncExternalStore(
    React.useCallback(
      (listener: () => void) => subscribe(preparedRequest.key, listener),
      [preparedRequest.key],
    ),
    React.useCallback(() => getEntry(preparedRequest.key).snapshot, [preparedRequest.key]),
    React.useCallback(() => getEntry(preparedRequest.key).snapshot, [preparedRequest.key]),
  );

  const reloadImpl = React.useCallback(
    async (mode: "loading" | "revalidating" = "loading") => {
      await performPreparedResourceRequest(
        resourcePath,
        "loader",
        preparedRequest,
        undefined,
        mode,
      );
    },
    [preparedRequest, resourcePath],
  );

  React.useEffect(() => {
    if (!snapshot.pending && !snapshot.loaderResult && !snapshot.failure) {
      void reloadImpl("loading");
    }
  }, [reloadImpl, snapshot.failure, snapshot.loaderResult, snapshot.pending]);

  const setSearch = React.useCallback<ResourceLocationState["setSearch"]>(
    (updates) => {
      const current = new URL(`https://volt.local/?${searchState.toString()}`);
      const result = applySearchParams(current, updates);

      if (!result.changed) {
        return;
      }

      const nextUrl = new URL(result.href);
      React.startTransition(() => {
        setSearchState(new URLSearchParams(nextUrl.search));
      });
    },
    [searchState],
  );

  const submit = React.useCallback<ResourceActionsState["submit"]>(
    async (payload, options) => {
      const formData = createFormDataPayload(payload);
      options?.onBeforeSubmit?.(formData);
      const result = await performPreparedResourceRequest(
        resourcePath,
        "action",
        preparedRequest,
        formData,
        "submitting",
      );

      if (!result || !("kind" in result)) {
        return;
      }

      if (result.kind === "error" || result.kind === "fault") {
        options?.onError?.(result);
        return;
      }

      options?.onSuccess?.(result);
    },
    [preparedRequest, resourcePath],
  );

  const reload = React.useCallback(() => {
    void reloadImpl(snapshot.loaderResult ? "revalidating" : "loading");
  }, [reloadImpl, snapshot.loaderResult]);

  const retry = React.useCallback(() => {
    void reloadImpl(snapshot.loaderResult ? "revalidating" : "loading");
  }, [reloadImpl, snapshot.loaderResult]);

  if (snapshot.failure) {
    throw snapshot.failure;
  }

  return React.useMemo(
    () => ({
      id: resourcePath,
      params,
      search: searchState,
      setSearch,
      status: snapshot.status,
      pending: snapshot.pending,
      loaderResult: snapshot.loaderResult,
      actionResult: snapshot.actionResult,
      data: snapshot.data,
      view: snapshot.view,
      submit,
      reload,
      retry,
    }),
    [
      params,
      reload,
      resourcePath,
      retry,
      searchState,
      setSearch,
      snapshot.actionResult,
      snapshot.data,
      snapshot.loaderResult,
      snapshot.pending,
      snapshot.status,
      snapshot.view,
      submit,
    ],
  );
}

async function performPreparedResourceRequest(
  resourcePath: string,
  operation: "loader" | "action",
  preparedRequest: PreparedResourceRequest,
  payload?: FormData | Record<string, unknown>,
  mode: "loading" | "revalidating" | "submitting" = "loading",
): Promise<NonNullable<ActionHookResult> | LoaderHookResult | void> {
  const { key, normalizedRequest } = preparedRequest;
  const entry = getEntry(key);

  if (entry.inFlight) {
    return entry.inFlight;
  }

  entry.snapshot = {
    ...entry.snapshot,
    status: mode,
    pending: true,
    failure: undefined,
  };
  notify(entry);

  entry.inFlight = (async () => {
    try {
      const response =
        operation === "action"
          ? await fetch("/_volt/resource", {
              method: "POST",
              ...createInternalActionRequestInit(
                {
                  path: resourcePath,
                  operation,
                  request: {
                    params: normalizedRequest.params,
                    search: normalizedRequest.search,
                  },
                },
                payload,
              ),
            })
          : await fetch("/_volt/resource", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: VOLT_RESULT_ACCEPT,
              },
              body: JSON.stringify({
                path: resourcePath,
                operation,
                request: {
                  params: normalizedRequest.params,
                  search: normalizedRequest.search,
                },
              }),
            });

      if (operation === "loader") {
        const loaderResult = await parseLoaderResponse(response);
        entry.snapshot = {
          ...entry.snapshot,
          loaderResult,
          data: loaderResult.kind === "data" ? loaderResult.data : null,
          view: loaderResult.kind === "view" ? loaderResult.node : null,
          status: "idle",
          pending: false,
          failure: undefined,
        };
        return loaderResult;
      }

      const actionResult = (await parseActionResponse(response)) as NonNullable<ActionHookResult>;

      if (actionResult.kind === "redirect") {
        entry.snapshot = {
          ...entry.snapshot,
          actionResult,
          status: "idle",
          pending: false,
          failure: undefined,
        };
        performClientRedirect(actionResult.location, actionResult.replace);
        return actionResult;
      }

      if (actionResult.kind === "fault") {
        entry.snapshot = {
          ...entry.snapshot,
          actionResult,
          status: "error",
          pending: false,
          failure: actionResult,
        };
        throw actionResult;
      }

      entry.snapshot = {
        ...entry.snapshot,
        actionResult,
        data: actionResult.kind === "data" ? actionResult.data : null,
        view: actionResult.kind === "view" ? actionResult.node : null,
        status: actionResult.kind === "error" ? "error" : "idle",
        pending: false,
        failure: undefined,
      };
      return actionResult;
    } catch (error) {
      if (isRedirectSignal(error)) {
        performClientRedirect(error.location, error.replace);
        entry.snapshot = {
          ...entry.snapshot,
          status: "idle",
          pending: false,
          failure: undefined,
        };
        return;
      }

      entry.snapshot = {
        ...entry.snapshot,
        status: isRouteLikeError(error) ? "error" : "error",
        pending: false,
        failure: error,
      };
      throw error;
    } finally {
      entry.inFlight = undefined;
      notify(entry);
      cleanupResourceEntry(key, entry);
    }
  })();

  return entry.inFlight;
}

function createUrlSearchParams(search?: ResourceRequest["search"]): URLSearchParams {
  if (!search) {
    return new URLSearchParams();
  }

  if (search instanceof URLSearchParams) {
    return new URLSearchParams(search);
  }

  return new URLSearchParams(search);
}

function normalizeResourceRequest(request?: ResourceRequest): NormalizedResourceRequest {
  const params = request?.params ?? {};
  const search = Object.fromEntries(createUrlSearchParams(request?.search).entries());

  return {
    params,
    search,
  };
}

function prepareResourceRequest(
  resourcePath: string,
  request?: ResourceRequest,
): PreparedResourceRequest {
  const normalizedRequest = normalizeResourceRequest(request);

  return {
    key: createResourceCacheKey(resourcePath, normalizedRequest),
    normalizedRequest,
  };
}

function createResourceCacheKey(
  resourcePath: string,
  normalizedRequest: NormalizedResourceRequest,
): string {
  return JSON.stringify({
    path: resourcePath,
    params: sortRecord(normalizedRequest.params),
    search: sortRecord(normalizedRequest.search),
  });
}

function sortRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function subscribe(key: string, listener: () => void): () => void {
  const entry = getEntry(key);
  entry.listeners.add(listener);

  return () => {
    entry.listeners.delete(listener);
    cleanupResourceEntry(key, entry);
  };
}

function getInitialSnapshot(): ResourceSnapshot {
  return {
    loaderResult: null,
    actionResult: null,
    data: null,
    view: null,
    status: "idle",
    pending: false,
  };
}

function getEntry(key: string): ResourceStoreEntry {
  let entry = resourceStore.get(key);

  if (!entry) {
    entry = {
      snapshot: getInitialSnapshot(),
      listeners: new Set(),
    };
    resourceStore.set(key, entry);
    pruneResourceStore();
  }

  return entry;
}

function notify(entry: ResourceStoreEntry): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

function cleanupResourceEntry(key: string, entry: ResourceStoreEntry): void {
  if (entry.listeners.size > 0 || entry.inFlight || entry.snapshot.pending) {
    return;
  }

  resourceStore.delete(key);
}

function pruneResourceStore(): void {
  if (resourceStore.size <= RESOURCE_STORE_LIMIT) {
    return;
  }

  for (const [key, entry] of resourceStore) {
    if (resourceStore.size <= RESOURCE_STORE_LIMIT) {
      return;
    }

    cleanupResourceEntry(key, entry);
  }
}

function performClientRedirect(href: string, replace: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  if (replace) {
    window.history.replaceState(null, "", href);
  } else {
    window.history.pushState(null, "", href);
  }

  window.dispatchEvent(new PopStateEvent("popstate"));
}
