import * as React from "react";

import type {
  ActionHookResult,
  LoaderHookResult,
  ResourceRequest,
  RouteFormProps,
  RouteStatus,
  SearchParamsUpdate,
  SetSearchParams,
  SubmitOptions,
} from "../index";

import { matchPathname } from "../path-matching";
import { createInternalActionRequestInit, VOLT_RESULT_ACCEPT } from "../server/internal-requests";
import {
  isRedirectSignal,
  isRouteLikeError,
  parseActionResponse,
  parseLoaderResponse,
} from "./transport";

export type RouteRuntimeState = {
  id: string;
  params: Record<string, string>;
  search: URLSearchParams;
  setSearch: SetSearchParams;
  status: RouteStatus;
  pending: boolean;
  loaderResult: LoaderHookResult | null;
  actionResult: ActionHookResult;
  view: React.ReactNode | null;
  submit(payload: FormData | Record<string, unknown>, options?: SubmitOptions): Promise<void>;
  reload(): void;
  retry(): void;
};

let routeRuntimeContext: React.Context<RouteRuntimeState | null> | null = null;

function getRouteRuntimeContext(): React.Context<RouteRuntimeState | null> {
  if (!routeRuntimeContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Volt route runtime is not available in this environment.");
    }

    routeRuntimeContext = createContext<RouteRuntimeState | null>(null);
  }

  return routeRuntimeContext;
}

export function RouteRuntimeProvider(props: {
  value: RouteRuntimeState;
  children?: React.ReactNode;
}): React.ReactElement {
  const RouteRuntimeContext = getRouteRuntimeContext();

  return (
    <RouteRuntimeContext.Provider value={props.value}>
      {props.children}
    </RouteRuntimeContext.Provider>
  );
}

export function useRequiredRouteRuntime(routeId: string): RouteRuntimeState {
  const runtime = React.useContext(getRouteRuntimeContext());

  if (!runtime) {
    throw new Error(`Route "${routeId}" is being used outside the Volt runtime.`);
  }

  if (runtime.id !== routeId) {
    throw new Error(`Route "${routeId}" is not the active route. Active route is "${runtime.id}".`);
  }

  return runtime;
}

export function createPendingRuntimeState(routeId: string): RouteRuntimeState {
  return {
    id: routeId,
    params: {},
    search: new URLSearchParams(),
    setSearch() {
      throw new Error(`Route "${routeId}" cannot update search params before it is mounted.`);
    },
    status: "loading",
    pending: true,
    loaderResult: null,
    actionResult: null,
    view: null,
    submit: async () => {
      throw new Error(`Route "${routeId}" is not ready to submit.`);
    },
    reload() {
      throw new Error(`Route "${routeId}" cannot reload before it is mounted.`);
    },
    retry() {
      throw new Error(`Route "${routeId}" cannot retry before it is mounted.`);
    },
  };
}

export async function fetchRouteLoader(
  path: string,
  request: ResourceRequest,
  target?: string,
): Promise<LoaderHookResult> {
  const response = await fetch("/_volt/route", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: VOLT_RESULT_ACCEPT,
    },
    body: JSON.stringify({
      path,
      target,
      operation: "loader",
      request: normalizeRequest(request),
    }),
  });

  return parseLoaderResponse(response);
}

export async function fetchRouteAction(
  path: string,
  request: ResourceRequest,
  payload: FormData | Record<string, unknown>,
): Promise<ActionHookResult> {
  const actionRequest = createInternalActionRequestInit(
    {
      path,
      operation: "action",
      request: normalizeRequest(request),
    },
    payload,
  );

  const response = await fetch("/_volt/action", {
    method: "POST",
    headers: actionRequest.headers,
    body: actionRequest.body,
  });

  return parseActionResponse(response);
}

export function createRouteFormComponent(routeId: string): React.ComponentType<RouteFormProps> {
  return function VoltRouteForm(props: RouteFormProps): React.ReactElement {
    const runtime = useRequiredRouteRuntime(routeId);
    const { children, onSubmit, replace, revalidate, ...rest } = props;

    return React.createElement(
      "form",
      {
        ...rest,
        onSubmit(event: React.FormEvent<HTMLFormElement>) {
          (onSubmit as React.FormEventHandler<HTMLFormElement> | undefined)?.(event);

          if (event.defaultPrevented) {
            return;
          }

          event.preventDefault();
          void runtime.submit(new FormData(event.currentTarget), {
            replace,
            revalidate,
          });
        },
      },
      children,
    );
  };
}

function normalizeRequest(request: ResourceRequest): {
  params: Record<string, string>;
  search: Record<string, string>;
} {
  return {
    params: request.params ?? {},
    search:
      request.search instanceof URLSearchParams
        ? Object.fromEntries(request.search.entries())
        : (request.search ?? {}),
  };
}

export type { SearchParamsUpdate };
export { isRedirectSignal, isRouteLikeError, matchPathname };
