import * as React from "react";

import type { SubmitPayload } from "../form-data";
import type {
  ActionHookResult,
  LoaderHookResult,
  RouteFormProps,
  RouteStatus,
  SearchParamsUpdate,
  SetSearchParams,
  SubmitOptions,
} from "../index";

export type RouteLocationState = {
  id: string;
  params: Record<string, string>;
  search: URLSearchParams;
  setSearch(
    this: void,
    params: Parameters<SetSearchParams>[0],
    options?: Parameters<SetSearchParams>[1],
  ): void;
};

export type RouteStatusState = {
  id: string;
  status: RouteStatus;
  pending: boolean;
};

export type RouteDataState = {
  id: string;
  loaderResult: LoaderHookResult | null;
  actionResult: ActionHookResult;
  data: unknown;
  view: React.ReactNode | null;
  error: import("../index").RouteExplicitErrorLike | null;
};

export type RouteActionsState = {
  id: string;
  submit(this: void, payload: SubmitPayload, options?: SubmitOptions): Promise<void>;
  reload(this: void): void;
};

export type RouteRuntimeState = RouteLocationState &
  RouteStatusState &
  RouteDataState &
  RouteActionsState;

let routeLocationContext: React.Context<RouteLocationState | null> | null = null;
let routeStatusContext: React.Context<RouteStatusState | null> | null = null;
let routeDataContext: React.Context<RouteDataState | null> | null = null;
let routeActionsContext: React.Context<RouteActionsState | null> | null = null;
const routeFormComponentCache = new Map<string, React.ComponentType<RouteFormProps>>();

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

function getRouteLocationContext(): React.Context<RouteLocationState | null> {
  routeLocationContext ??= createRuntimeContext<RouteLocationState>("Litz route location");
  return routeLocationContext;
}

function getRouteStatusContext(): React.Context<RouteStatusState | null> {
  routeStatusContext ??= createRuntimeContext<RouteStatusState>("Litz route status");
  return routeStatusContext;
}

function getRouteDataContext(): React.Context<RouteDataState | null> {
  routeDataContext ??= createRuntimeContext<RouteDataState>("Litz route data");
  return routeDataContext;
}

function getRouteActionsContext(): React.Context<RouteActionsState | null> {
  routeActionsContext ??= createRuntimeContext<RouteActionsState>("Litz route actions");
  return routeActionsContext;
}

function requireActiveRouteSlice<T extends { id: string }>(routeId: string, value: T | null): T {
  if (!value) {
    throw new Error(`Route "${routeId}" is being used outside the Litz runtime.`);
  }

  if (value.id !== routeId) {
    throw new Error(`Route "${routeId}" is not the active route. Active route is "${value.id}".`);
  }

  return value;
}

export function RouteRuntimeProvider(props: {
  value: RouteRuntimeState;
  children?: React.ReactNode;
}): React.ReactElement {
  const RouteLocationContext = getRouteLocationContext();
  const RouteStatusContext = getRouteStatusContext();
  const RouteDataContext = getRouteDataContext();
  const RouteActionsContext = getRouteActionsContext();
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
      error: props.value.error,
    }),
    [
      props.value.actionResult,
      props.value.data,
      props.value.error,
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
    }),
    [props.value.id, props.value.reload, props.value.submit],
  );

  return (
    <RouteLocationContext.Provider value={locationValue}>
      <RouteStatusContext.Provider value={statusValue}>
        <RouteDataContext.Provider value={dataValue}>
          <RouteActionsContext.Provider value={actionsValue}>
            {props.children}
          </RouteActionsContext.Provider>
        </RouteDataContext.Provider>
      </RouteStatusContext.Provider>
    </RouteLocationContext.Provider>
  );
}

export function useRequiredRouteLocation(routeId: string): RouteLocationState {
  return requireActiveRouteSlice(routeId, React.useContext(getRouteLocationContext()));
}

export function useRequiredRouteStatus(routeId: string): RouteStatusState {
  return requireActiveRouteSlice(routeId, React.useContext(getRouteStatusContext()));
}

export function useRequiredRouteData(routeId: string): RouteDataState {
  return requireActiveRouteSlice(routeId, React.useContext(getRouteDataContext()));
}

export function useRequiredRouteActions(routeId: string): RouteActionsState {
  return requireActiveRouteSlice(routeId, React.useContext(getRouteActionsContext()));
}

export function createRouteFormComponent(routeId: string): React.ComponentType<RouteFormProps> {
  const cached = routeFormComponentCache.get(routeId);

  if (cached) {
    return cached;
  }

  const LitzRouteForm = function LitzRouteForm(props: RouteFormProps): React.ReactElement {
    const actions = useRequiredRouteActions(routeId);
    const { children, onSubmit, replace, revalidate, ...rest } = props;
    const submitRef = React.useRef((payload: SubmitPayload, options?: SubmitOptions) =>
      actions.submit(payload, options),
    );

    React.useEffect(() => {
      submitRef.current = (payload: SubmitPayload, options?: SubmitOptions) =>
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

  const MemoizedLitzRouteForm = React.memo(LitzRouteForm);
  MemoizedLitzRouteForm.displayName = `LitzRouteForm(${routeId})`;
  routeFormComponentCache.set(routeId, MemoizedLitzRouteForm);
  return MemoizedLitzRouteForm;
}

export type { SearchParamsUpdate };
