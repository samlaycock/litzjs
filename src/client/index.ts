import * as React from "react";
import { routeManifest } from "virtual:volt:route-manifest";

import type { ActionHookResult, LoaderHookResult, SubmitOptions } from "../index";
import type { RouteRuntimeState } from "./runtime";

import { createFormDataPayload } from "../form-data";
import { extractRouteLikeParams, matchPathname, sortByPathSpecificity } from "../path-matching";
import { installClientBindings } from "./bindings";
import { createLinkComponent } from "./link";
import { applySearchParams, shouldPrefetchLink } from "./navigation";
import { useResourceAction, useResourceLoader } from "./resources";
import { useResolvedRouteState } from "./route-host-state";
import {
  RouteRuntimeProvider,
  createRouteFormComponent,
  fetchRouteAction,
  fetchRouteLoader,
  isRedirectSignal,
  isRouteLikeError,
  useRequiredRouteActions,
  useRequiredRouteData,
  useRequiredRouteLocation,
  useRequiredRouteStatus,
} from "./runtime";
import { getRevalidateTargets } from "./transport";

installClientBindings({
  useRequiredRouteLocation,
  useRequiredRouteStatus,
  useRequiredRouteData,
  useRequiredRouteActions,
  useMatches,
  createRouteFormComponent,
  useResourceLoader,
  useResourceAction,
});

type LoadedRoute = {
  id: string;
  path: string;
  component: React.ComponentType;
  options?: {
    layout?: LoadedLayout;
    loader?: unknown;
    action?: unknown;
    middleware?: unknown[];
    pendingComponent?: React.ComponentType;
    errorComponent?: React.ComponentType<{ error: unknown }>;
  };
};

type LoadedLayout = {
  id: string;
  path: string;
  component: React.ComponentType<React.PropsWithChildren>;
  options?: {
    layout?: LoadedLayout;
    loader?: unknown;
    middleware?: unknown[];
    pendingComponent?: React.ComponentType;
    errorComponent?: React.ComponentType<{ error: unknown }>;
  };
};

type ManifestEntry = {
  id: string;
  path: string;
  load: () => Promise<{
    route?: LoadedRoute;
  }>;
};

const manifest = sortByPathSpecificity(routeManifest as ManifestEntry[]);
const exactManifestEntries = new Map<string, ManifestEntry>();
const dynamicManifestEntries: ManifestEntry[] = [];
const ROUTE_CACHE_LIMIT = 200;
const ROUTE_MODULE_CACHE_LIMIT = Math.max(manifest.length, 1);
let navigationContext: React.Context<{
  navigate(href: string, options?: { replace?: boolean }): void;
} | null> | null = null;
let matchesContext: React.Context<
  Array<{
    id: string;
    path: string;
    params: Record<string, string>;
    search: URLSearchParams;
  }>
> | null = null;
const routeCache = new Map<string, LoaderHookResult>();
const routeModuleCache = new Map<string, LoadedRoute>();
const routeModulePrefetchCache = new Map<string, Promise<void>>();
const layoutChainCache = new WeakMap<LoadedLayout, LoadedLayout[]>();
const pathParamNamesCache = new Map<string, string[]>();

for (const entry of manifest) {
  if (entry.path.includes(":")) {
    dynamicManifestEntries.push(entry);
  } else {
    exactManifestEntries.set(entry.path, entry);
  }
}

function getNavigationContext(): React.Context<{
  navigate(href: string, options?: { replace?: boolean }): void;
} | null> {
  if (!navigationContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Volt client navigation is not available in this environment.");
    }

    navigationContext = createContext<{
      navigate(href: string, options?: { replace?: boolean }): void;
    } | null>(null);
  }

  return navigationContext;
}

function getMatchesContext(): React.Context<
  Array<{
    id: string;
    path: string;
    params: Record<string, string>;
    search: URLSearchParams;
  }>
> {
  if (!matchesContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Volt client matches are not available in this environment.");
    }

    matchesContext = createContext<
      Array<{
        id: string;
        path: string;
        params: Record<string, string>;
        search: URLSearchParams;
      }>
    >([]);
  }

  return matchesContext;
}

export function mountApp(
  element: Element,
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>,
): void {
  void import("react-dom/client").then(({ createRoot }) => {
    const root = createRoot(element);
    root.render(React.createElement(VoltApp, { wrapper }));
  });
}

export function useNavigate(): (href: string, options?: { replace?: boolean }) => void {
  const context = React.useContext(getNavigationContext());

  if (!context) {
    throw new Error("useNavigate() must be used inside the Volt client runtime.");
  }

  return (href: string, options?: { replace?: boolean }) => context.navigate(href, options);
}

export function useMatches(): Array<{
  id: string;
  path: string;
  params: Record<string, string>;
  search: URLSearchParams;
}> {
  return React.useContext(getMatchesContext());
}

export const Link = createLinkComponent({
  useNavigate,
  prefetchRouteModuleForHref,
});

function VoltApp(props: {
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>;
}): React.ReactElement {
  const [location, setLocation] = React.useState(() => window.location.href);

  React.useEffect(() => {
    function handlePopState(): void {
      React.startTransition(() => {
        setLocation(window.location.href);
      });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = React.useCallback((next: string, replace = false) => {
    if (replace) {
      window.history.replaceState(null, "", next);
    } else {
      window.history.pushState(null, "", next);
    }

    React.startTransition(() => {
      setLocation(window.location.href);
    });
  }, []);

  const navigationValue = React.useMemo(
    () => ({
      navigate(href: string, options?: { replace?: boolean }) {
        navigate(href, options?.replace);
      },
    }),
    [navigate],
  );

  const content = React.createElement(RouteHost, {
    location,
    navigate,
    wrapper: props.wrapper,
  });

  return React.createElement(
    getNavigationContext().Provider,
    {
      value: navigationValue,
    },
    content,
  );
}

function RouteHost(props: {
  location: string;
  navigate(this: void, next: string, replace?: boolean): void;
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>;
}): React.ReactElement {
  const navigate = React.useCallback(
    (next: string, replace?: boolean) => {
      props.navigate(next, replace);
    },
    [props.navigate],
  );
  const url = React.useMemo(() => new URL(props.location), [props.location]);
  const search = React.useMemo(() => new URLSearchParams(url.search), [url.search]);
  const matched = React.useMemo(() => findMatch(url.pathname), [url.pathname]);
  const createBootstrapPageStateForLocation = React.useCallback(
    (route: LoadedRoute) => createBootstrapPageState(route, url.pathname, search),
    [search, url.pathname],
  );
  const { displayLocation, renderedRoute, pageState, setPageState } = useResolvedRouteState<
    LoadedRoute,
    PageState
  >({
    matched,
    location: props.location,
    createEmptyPageState,
    createBootstrapPageState: createBootstrapPageStateForLocation,
    getCachedRoute: getCachedRouteModule,
    setCachedRoute: setCachedRouteModule,
  });

  const displayedUrl = React.useMemo(() => new URL(displayLocation), [displayLocation]);
  const displayedSearch = React.useMemo(
    () => new URLSearchParams(displayedUrl.search),
    [displayedUrl.search],
  );
  const activeRouteState = React.useMemo(() => {
    if (!renderedRoute) {
      return null;
    }

    const activeMatches = buildActiveMatches(renderedRoute, displayedUrl.pathname, displayedSearch);

    return {
      activeMatches,
      loaderMatches: activeMatches.filter((entry) => Boolean(entry.options?.loader)),
      baseRequest: {
        params: extractRouteParams(renderedRoute.path, displayedUrl.pathname) ?? {},
        search: displayedSearch,
      },
    };
  }, [displayedSearch, displayedUrl.pathname, renderedRoute]);

  React.useEffect(() => {
    if (!renderedRoute || !activeRouteState) {
      return;
    }

    let cancelled = false;
    const { loaderMatches, baseRequest } = activeRouteState;
    const finalLoaderMatchId = loaderMatches[loaderMatches.length - 1]?.id;

    const reload = async (mode: "loading" | "revalidating" = "loading") => {
      if (loaderMatches.length === 0) {
        if (!cancelled) {
          setPageState((current) => ({
            ...current,
            status: "idle",
            pending: false,
            errorInfo: undefined,
            errorTargetId: undefined,
          }));
        }
        return;
      }

      setPageState((current) => applyCachedLoaderStateToPageState(current, loaderMatches, mode));

      for (const entry of loaderMatches) {
        try {
          const loaderResult = await fetchRouteLoader(renderedRoute.path, baseRequest, entry.id);

          if (cancelled) {
            return;
          }

          setCachedLoaderResult(entry.cacheKey, withLoaderStaleState(loaderResult, false));

          setPageState((current) =>
            withMatchLoaderResult(
              current,
              entry.id,
              loaderResult,
              entry.id === finalLoaderMatchId ? "idle" : current.status,
              entry.id === finalLoaderMatchId ? false : current.pending,
            ),
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          if (isRedirectSignal(error)) {
            navigate(error.location, true);
            return;
          }

          if (isRouteLikeError(error)) {
            setPageState((current) => ({
              ...current,
              status: "error",
              pending: false,
              errorInfo: error,
              errorTargetId: entry.id,
            }));
            return;
          }

          throw error;
        }
      }
    };

    void reload();

    return () => {
      cancelled = true;
    };
  }, [activeRouteState, navigate, renderedRoute]);
  const activeMatches: ActiveMatch[] = activeRouteState?.activeMatches ?? [];
  const matchesValue = activeMatches;
  const reloadImpl = React.useCallback(
    (mode?: "loading" | "revalidating") =>
      renderedRoute
        ? reloadCurrentRoute({
            route: renderedRoute,
            pathname: displayedUrl.pathname,
            search: displayedSearch,
            navigate,
            setPageState,
            mode,
          })
        : Promise.resolve(),
    [displayedSearch, displayedUrl.pathname, navigate, renderedRoute, setPageState],
  );

  if (!matched) {
    return React.createElement(NotFoundPage);
  }

  if (!renderedRoute) {
    return React.createElement(React.Fragment);
  }

  const content = renderMatchChain(
    renderedRoute,
    activeMatches,
    pageState,
    displayLocation,
    navigate,
    reloadImpl,
    setPageState,
  );

  return React.createElement(
    getMatchesContext().Provider,
    {
      value: matchesValue,
    },
    props.wrapper ? React.createElement(props.wrapper, null, content) : content,
  );
}

function findMatch(pathname: string): {
  entry: ManifestEntry;
  params: Record<string, string>;
} | null {
  const exactEntry = exactManifestEntries.get(pathname);

  if (exactEntry) {
    return {
      entry: exactEntry,
      params: {},
    };
  }

  for (const entry of dynamicManifestEntries) {
    const params = matchPathname(entry.path, pathname);

    if (params) {
      return { entry, params };
    }
  }

  return null;
}

function NotFoundPage(): React.ReactElement {
  return React.createElement("main", null, React.createElement("h1", null, "Not Found"));
}

type MatchErrorInfo = {
  kind: "error" | "fault";
  status: number;
  headers: Headers;
  message: string;
  code?: string;
  digest?: string;
  data?: unknown;
};

type ActiveMatch = {
  id: string;
  path: string;
  cacheKey: string;
  kind: "layout" | "route";
  component: React.ComponentType<any>;
  options?: {
    layout?: LoadedLayout;
    loader?: unknown;
    action?: unknown;
    middleware?: unknown[];
    pendingComponent?: React.ComponentType;
    errorComponent?: React.ComponentType<{ error: unknown }>;
  };
  params: Record<string, string>;
  search: URLSearchParams;
};

type PageState = {
  matchStates: Record<
    string,
    {
      loaderResult: LoaderHookResult | null;
    }
  >;
  actionResult: ActionHookResult;
  status: RouteRuntimeState["status"];
  pending: boolean;
  errorInfo?: MatchErrorInfo;
  errorTargetId?: string;
};

function createEmptyPageState(): PageState {
  return {
    matchStates: {},
    actionResult: null,
    status: "loading",
    pending: true,
  };
}

function createBootstrapPageState(
  route: LoadedRoute,
  pathname: string,
  search: URLSearchParams,
): PageState {
  const matches = buildActiveMatches(route, pathname, search);
  const matchStates: PageState["matchStates"] = {};
  let hasAnyLoader = false;
  let hasCachedLoader = false;
  let missingLoader = false;

  for (const match of matches) {
    if (!match.options?.loader) {
      continue;
    }

    hasAnyLoader = true;
    const cached = getCachedLoaderResult(match.cacheKey);

    if (cached) {
      hasCachedLoader = true;
      matchStates[match.id] = {
        loaderResult: withLoaderStaleState(cached, true),
      };
    } else {
      missingLoader = true;
      matchStates[match.id] = {
        loaderResult: null,
      };
    }
  }

  if (!hasAnyLoader) {
    return {
      matchStates,
      actionResult: null,
      status: "idle",
      pending: false,
    };
  }

  return {
    matchStates,
    actionResult: null,
    status: hasCachedLoader ? "revalidating" : "loading",
    pending: missingLoader || hasCachedLoader,
  };
}

function applyCachedLoaderStateToPageState(
  current: PageState,
  matches: ActiveMatch[],
  mode: "loading" | "revalidating",
): PageState {
  const matchStates = { ...current.matchStates };
  let hasResolvedLoader = false;

  for (const match of matches) {
    const cached = getCachedLoaderResult(match.cacheKey);

    if (cached) {
      matchStates[match.id] = {
        loaderResult: withLoaderStaleState(cached, true),
      };
      hasResolvedLoader = true;
    } else if (!matchStates[match.id]) {
      matchStates[match.id] = {
        loaderResult: null,
      };
    } else if (matchStates[match.id]?.loaderResult) {
      hasResolvedLoader = true;
    }
  }

  return {
    ...current,
    matchStates,
    status: hasResolvedLoader ? "revalidating" : mode,
    pending: true,
    errorInfo: undefined,
    errorTargetId: undefined,
  };
}

function withMatchLoaderResult(
  current: PageState,
  matchId: string,
  loaderResult: LoaderHookResult,
  status: RouteRuntimeState["status"],
  pending: boolean,
): PageState {
  return {
    ...current,
    matchStates: {
      ...current.matchStates,
      [matchId]: {
        loaderResult,
      },
    },
    status,
    pending,
    errorInfo: undefined,
    errorTargetId: undefined,
  };
}

async function reloadCurrentRoute(options: {
  route: LoadedRoute;
  pathname: string;
  search: URLSearchParams;
  navigate: (next: string, replace?: boolean) => void;
  setPageState: React.Dispatch<React.SetStateAction<PageState>>;
  mode?: "loading" | "revalidating";
}): Promise<void> {
  const matches = buildActiveMatches(options.route, options.pathname, options.search);
  const loaderMatches = matches.filter((entry) => Boolean(entry.options?.loader));

  if (loaderMatches.length === 0) {
    options.setPageState((current) => ({
      ...current,
      status: "idle",
      pending: false,
      errorInfo: undefined,
      errorTargetId: undefined,
    }));
    return;
  }

  options.setPageState((current) =>
    applyCachedLoaderStateToPageState(current, loaderMatches, options.mode ?? "loading"),
  );

  const baseRequest = {
    params: extractRouteParams(options.route.path, options.pathname) ?? {},
    search: options.search,
  };

  for (const entry of loaderMatches) {
    try {
      const loaderResult = await fetchRouteLoader(options.route.path, baseRequest, entry.id);
      setCachedLoaderResult(entry.cacheKey, withLoaderStaleState(loaderResult, false));
      options.setPageState((current) =>
        withMatchLoaderResult(
          current,
          entry.id,
          loaderResult,
          entry === loaderMatches[loaderMatches.length - 1] ? "idle" : current.status,
          entry === loaderMatches[loaderMatches.length - 1] ? false : current.pending,
        ),
      );
    } catch (error) {
      if (isRedirectSignal(error)) {
        options.navigate(error.location, true);
        return;
      }

      if (isRouteLikeError(error)) {
        options.setPageState((current) => ({
          ...current,
          status: "error",
          pending: false,
          errorInfo: error,
          errorTargetId: entry.id,
        }));
        return;
      }

      throw error;
    }
  }
}

function renderMatchChain(
  route: LoadedRoute,
  matches: ActiveMatch[],
  pageState: PageState,
  location: string,
  navigate: (next: string, replace?: boolean) => void,
  reloadImpl: (mode?: "loading" | "revalidating") => Promise<void>,
  setPageState: React.Dispatch<React.SetStateAction<PageState>>,
): React.ReactElement {
  const errorBoundaryIndex = findErrorBoundaryIndex(matches, pageState);
  const pendingBoundaryIndex =
    errorBoundaryIndex === null ? findPendingBoundaryIndex(matches, pageState) : null;

  if (
    errorBoundaryIndex === null &&
    pendingBoundaryIndex === null &&
    matches.some(
      (match) => Boolean(match.options?.loader) && !pageState.matchStates[match.id]?.loaderResult,
    )
  ) {
    return React.createElement(React.Fragment);
  }

  let node: React.ReactElement | null = null;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];

    if (!match) {
      continue;
    }

    let content: React.ReactElement;

    if (errorBoundaryIndex !== null && index === errorBoundaryIndex) {
      const ErrorComponent = match.options?.errorComponent ?? DefaultRouteErrorPage;
      content = React.createElement(ErrorComponent as React.ComponentType<any>, {
        error: pageState.errorInfo,
      });
    } else if (pendingBoundaryIndex !== null && index === pendingBoundaryIndex) {
      content = React.createElement(match.options?.pendingComponent as React.ComponentType);
    } else if (errorBoundaryIndex !== null && index > errorBoundaryIndex) {
      continue;
    } else if (pendingBoundaryIndex !== null && index > pendingBoundaryIndex) {
      continue;
    } else if (match.kind === "route") {
      content = React.createElement(match.component as React.ComponentType);
    } else {
      content = React.createElement(
        match.component as React.ComponentType<React.PropsWithChildren>,
        null,
        node,
      );
    }

    node = React.createElement(
      MatchRuntimeBoundary,
      {
        key: match.id,
        match,
        route,
        pageState,
        location,
        navigate,
        reloadImpl,
        setPageState,
      },
      content,
    );
  }

  return node ?? React.createElement(React.Fragment);
}

function findErrorBoundaryIndex(matches: ActiveMatch[], pageState: PageState): number | null {
  if (!pageState.errorInfo || !pageState.errorTargetId) {
    return null;
  }

  const targetIndex = matches.findIndex((match) => match.id === pageState.errorTargetId);

  if (targetIndex === -1) {
    return null;
  }

  for (let index = targetIndex; index >= 0; index -= 1) {
    const match = matches[index];

    if (match && match.options?.errorComponent) {
      return index;
    }
  }

  return targetIndex;
}

function findPendingBoundaryIndex(matches: ActiveMatch[], pageState: PageState): number | null {
  if (!pageState.pending) {
    return null;
  }

  const targetIndex = matches.findIndex(
    (match) => Boolean(match.options?.loader) && !pageState.matchStates[match.id]?.loaderResult,
  );

  if (targetIndex === -1) {
    return null;
  }

  for (let index = targetIndex; index >= 0; index -= 1) {
    const match = matches[index];

    if (match && match.options?.pendingComponent) {
      return index;
    }
  }

  return null;
}

function DefaultRouteErrorPage(props: {
  error: {
    kind: "error" | "fault";
    status: number;
    message: string;
  };
}): React.ReactElement {
  return React.createElement(
    "main",
    null,
    React.createElement("h1", null, "Route Error"),
    React.createElement(
      "p",
      null,
      `${props.error.kind} ${props.error.status}: ${props.error.message}`,
    ),
  );
}

function MatchRuntimeBoundary(props: {
  match: ActiveMatch;
  route: LoadedRoute;
  pageState: PageState;
  location: string;
  navigate: (next: string, replace?: boolean) => void;
  reloadImpl: (mode?: "loading" | "revalidating") => Promise<void>;
  setPageState: React.Dispatch<React.SetStateAction<PageState>>;
  children?: React.ReactNode;
}): React.ReactElement {
  const runtime = useMatchRuntime(props);

  return React.createElement(
    RouteRuntimeProvider,
    {
      value: runtime,
    },
    props.children,
  );
}

function useMatchRuntime(options: {
  match: ActiveMatch;
  route: LoadedRoute;
  pageState: PageState;
  location: string;
  navigate: (next: string, replace?: boolean) => void;
  reloadImpl: (mode?: "loading" | "revalidating") => Promise<void>;
  setPageState: React.Dispatch<React.SetStateAction<PageState>>;
}): RouteRuntimeState {
  const { match, route, pageState, location, navigate, reloadImpl, setPageState } = options;
  const loaderResult = pageState.matchStates[match.id]?.loaderResult ?? null;
  const actionResult = match.kind === "route" ? pageState.actionResult : null;
  const view = loaderResult?.kind === "view" ? loaderResult.node : null;

  const setSearch = React.useCallback<RouteRuntimeState["setSearch"]>(
    (updates, submitOptions) => {
      const result = applySearchParams(new URL(location), updates);

      if (!result.changed) {
        return;
      }

      navigate(result.href, submitOptions?.replace);
    },
    [location, navigate],
  );

  const submit = React.useCallback<RouteRuntimeState["submit"]>(
    async (payload, submitOptions) => {
      if (match.kind !== "route" || !route.options?.action) {
        throw new Error(`Route "${match.path}" does not define an action.`);
      }

      const formData = createFormDataPayload(payload);
      submitOptions?.onBeforeSubmit?.(formData);

      setPageState((current) => ({
        ...current,
        status: "submitting",
        pending: true,
      }));

      const result = await fetchRouteAction(
        route.path,
        {
          params: match.params,
          search: match.search,
        },
        formData,
      );

      if (result?.kind === "redirect") {
        navigate(result.location, submitOptions?.replace ?? result.replace);
        return;
      }

      if (result?.kind === "view") {
        setCachedLoaderResult(match.cacheKey, {
          kind: "view",
          status: result.status,
          headers: result.headers,
          stale: false,
          node: result.node,
          render: result.render,
        });

        setPageState((current) => ({
          ...current,
          matchStates: {
            ...current.matchStates,
            [route.id]: {
              loaderResult: {
                kind: "view",
                status: result.status,
                headers: result.headers,
                stale: false,
                node: result.node,
                render: result.render,
              },
            },
          },
          actionResult: result,
          status: "idle",
          pending: false,
        }));
      } else if (result) {
        setPageState((current) => ({
          ...current,
          actionResult: result,
          status: result.kind === "error" || result.kind === "fault" ? "error" : "idle",
          pending: false,
          errorInfo:
            result.kind === "error" || result.kind === "fault"
              ? (result as MatchErrorInfo)
              : current.errorInfo,
          errorTargetId:
            result.kind === "error" || result.kind === "fault" ? route.id : current.errorTargetId,
        }));
      }

      if (result && shouldRevalidateAfterSubmit(route, result.headers, submitOptions?.revalidate)) {
        await reloadImpl("revalidating");
      }

      if (result?.kind === "error" || result?.kind === "fault") {
        submitOptions?.onError?.(result);
      } else if (result) {
        submitOptions?.onSuccess?.(result);
      }
    },
    [match, navigate, reloadImpl, route, setPageState],
  );

  const reload = React.useCallback(() => {
    void reloadImpl("revalidating");
  }, [reloadImpl]);

  const retry = React.useCallback(() => {
    void reloadImpl("loading");
  }, [reloadImpl]);

  return React.useMemo(
    () => ({
      id: match.id,
      params: match.params,
      search: match.search,
      setSearch,
      status: pageState.status,
      pending: pageState.pending,
      loaderResult,
      actionResult,
      view,
      submit,
      reload,
      retry,
    }),
    [
      actionResult,
      loaderResult,
      match.id,
      match.params,
      match.search,
      pageState.pending,
      pageState.status,
      reload,
      retry,
      setSearch,
      submit,
      view,
    ],
  );
}

function getLayoutChain(layout: LoadedLayout | undefined): LoadedLayout[] {
  if (!layout) {
    return [];
  }

  const cached = layoutChainCache.get(layout);

  if (cached) {
    return cached;
  }

  const chain = [...getLayoutChain(layout.options?.layout), layout];
  layoutChainCache.set(layout, chain);
  return chain;
}

function buildActiveMatches(
  route: LoadedRoute,
  pathname: string,
  search: URLSearchParams,
): ActiveMatch[] {
  const routeParams = extractRouteParams(route.path, pathname) ?? {};
  const layouts = getLayoutChain(route.options?.layout);
  const sortedSearch = sortRecord(Object.fromEntries(search.entries()));
  const layoutMatches = layouts.map((layout) => {
    const params =
      extractRouteParams(layout.path, pathname) ?? filterParamsForPath(routeParams, layout.path);

    return {
      id: layout.id,
      path: layout.path,
      cacheKey: createRouteCacheKey(layout.path, params, sortedSearch),
      kind: "layout" as const,
      component: layout.component,
      options: layout.options,
      params,
      search,
    };
  });

  return [
    ...layoutMatches,
    {
      id: route.id,
      path: route.path,
      cacheKey: createRouteCacheKey(route.path, routeParams, sortedSearch),
      kind: "route",
      component: route.component,
      options: route.options,
      params: routeParams,
      search,
    },
  ];
}

function shouldRevalidateAfterSubmit(
  route: LoadedRoute,
  headers: Headers,
  revalidate: SubmitOptions["revalidate"],
): boolean {
  if (revalidate === false) {
    return false;
  }

  if (revalidate === true) {
    return true;
  }

  const targets = new Set(getRevalidateTargets(headers));

  if (Array.isArray(revalidate)) {
    for (const target of revalidate) {
      targets.add(target);
    }
  }

  if (targets.size === 0) {
    return false;
  }

  return getActiveMatchPaths(route).some((path) => targets.has(path));
}

function extractRouteParams(pathPattern: string, pathname: string): Record<string, string> | null {
  return extractRouteLikeParams(pathPattern, pathname);
}

function filterParamsForPath(
  params: Record<string, string>,
  pathPattern: string,
): Record<string, string> {
  const names = getPathParamNames(pathPattern);

  return Object.fromEntries(
    names.map((name) => [name, params[name]]).filter((entry) => entry[1] !== undefined),
  );
}

function createRouteCacheKey(
  path: string,
  params: Record<string, string>,
  sortedSearch: Record<string, string>,
): string {
  return JSON.stringify({
    path,
    params: sortRecord(params),
    search: sortedSearch,
  });
}

function getActiveMatchPaths(route: LoadedRoute): string[] {
  return [...getLayoutChain(route.options?.layout).map((layout) => layout.path), route.path];
}

function getPathParamNames(pathPattern: string): string[] {
  const cached = pathParamNamesCache.get(pathPattern);

  if (cached) {
    return cached;
  }

  const names = Array.from(pathPattern.matchAll(/:([A-Za-z0-9_]+)/g), (match) => match[1]).filter(
    (name): name is string => Boolean(name),
  );
  pathParamNamesCache.set(pathPattern, names);
  return names;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function getCachedLoaderResult(key: string): LoaderHookResult | undefined {
  const cached = routeCache.get(key);

  if (!cached) {
    return undefined;
  }

  routeCache.delete(key);
  routeCache.set(key, cached);
  return cached;
}

function setCachedLoaderResult(key: string, result: LoaderHookResult): void {
  if (routeCache.has(key)) {
    routeCache.delete(key);
  }

  routeCache.set(key, result);

  while (routeCache.size > ROUTE_CACHE_LIMIT) {
    const oldestKey = routeCache.keys().next().value;

    if (oldestKey === undefined) {
      return;
    }

    routeCache.delete(oldestKey);
  }
}

function getCachedRouteModule(id: string): LoadedRoute | null {
  const cached = routeModuleCache.get(id);

  if (!cached) {
    return null;
  }

  routeModuleCache.delete(id);
  routeModuleCache.set(id, cached);
  return cached;
}

function setCachedRouteModule(id: string, route: LoadedRoute): void {
  if (routeModuleCache.has(id)) {
    routeModuleCache.delete(id);
  }

  routeModuleCache.set(id, route);

  while (routeModuleCache.size > ROUTE_MODULE_CACHE_LIMIT) {
    const oldestKey = routeModuleCache.keys().next().value;

    if (oldestKey === undefined) {
      return;
    }

    routeModuleCache.delete(oldestKey);
  }
}

function prefetchRouteModuleForHref(
  href: string,
  target?: string,
  download?: string | boolean,
): void {
  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(href, currentUrl);

  if (
    !shouldPrefetchLink({
      target,
      download,
      currentUrl,
      nextUrl,
    })
  ) {
    return;
  }

  const matched = findMatch(nextUrl.pathname);

  if (!matched || routeModuleCache.has(matched.entry.id)) {
    return;
  }

  const inFlight = routeModulePrefetchCache.get(matched.entry.id);

  if (inFlight) {
    return;
  }

  const prefetch = matched.entry
    .load()
    .then((loaded) => {
      if (loaded.route) {
        setCachedRouteModule(matched.entry.id, loaded.route);
      }
    })
    .catch(() => {
      return;
    })
    .finally(() => {
      routeModulePrefetchCache.delete(matched.entry.id);
    });

  routeModulePrefetchCache.set(matched.entry.id, prefetch);
}

function withLoaderStaleState(result: LoaderHookResult, stale: boolean): LoaderHookResult {
  if (result.stale === stale) {
    return result;
  }

  if (result.kind === "data") {
    return {
      ...result,
      stale,
    };
  }

  return {
    ...result,
    stale,
    render: result.render,
  };
}
