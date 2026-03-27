import * as React from "react";
import { routeManifest } from "virtual:litzjs:route-manifest";

import type { ActionHookResult, LayoutReference, LoaderHookResult, SubmitOptions } from "../index";
import type { RouteRuntimeState } from "./runtime";

import { createFormDataPayload } from "../form-data";
import { LITZ_RESULT_ACCEPT } from "../internal-transport";
import {
  extractRouteLikeParams,
  hasPatternSegments,
  matchPathname,
  sortByPathSpecificity,
} from "../path-matching";
import { createSearchParamRecord, type SearchParamRecord } from "../search-params";
import { installClientBindings } from "./bindings";
import { createLinkComponent } from "./link";
import { processLoaderResults, type LoaderSettledResult } from "./loader-fetch";
import { applySearchParams, shouldPrefetchLink } from "./navigation";
import { resolveSettledPageStatus, withSettledPageState } from "./page-state";
import {
  createResourceComponent,
  createResourceFormComponent,
  useRequiredResourceActions,
  useRequiredResourceData,
  useRequiredResourceLocation,
  useRequiredResourceStatus,
} from "./resources";
import { useResolvedRouteState } from "./route-host-state";
import {
  RouteRuntimeProvider,
  createRouteFormComponent,
  fetchRouteAction,
  useRequiredRouteActions,
  useRequiredRouteData,
  useRequiredRouteLocation,
  useRequiredRouteStatus,
} from "./runtime";
import { sortRecord } from "./sort-record";
import { getRevalidateTargets, parseLoaderResponse } from "./transport";

installClientBindings({
  usePathname,
  useLocation,
  useRequiredRouteLocation,
  useRequiredRouteStatus,
  useRequiredRouteData,
  useRequiredRouteActions,
  useRequiredResourceLocation,
  useRequiredResourceStatus,
  useRequiredResourceData,
  useRequiredResourceActions,
  useMatches,
  createRouteFormComponent,
  createResourceFormComponent,
  createResourceComponent,
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
    errorBoundary?: React.ComponentType<{ error: unknown }>;
    offline?: {
      fallbackComponent?: React.ComponentType;
      preserveStaleOnFailure?: boolean;
    };
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
    errorBoundary?: React.ComponentType<{ error: unknown }>;
    offline?: {
      fallbackComponent?: React.ComponentType;
      preserveStaleOnFailure?: boolean;
    };
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
let locationContext: React.Context<{
  href: string;
  pathname: string;
  search: URLSearchParams;
  hash: string;
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
const routeModulePrefetchCache = new Map<string, Promise<LoadedRoute | null>>();
const routeDataPrefetchCache = new Map<string, Promise<void>>();
const layoutChainCache = new WeakMap<LoadedLayout, LoadedLayout[]>();
const pathParamNamesCache = new Map<string, string[]>();

interface MountAppOptions {
  readonly component?: React.JSXElementConstructor<{ children: React.ReactNode }>;
  readonly layout?: LayoutReference;
}

for (const entry of manifest) {
  if (hasPatternSegments(entry.path)) {
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
      throw new Error("Litz client navigation is not available in this environment.");
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
      throw new Error("Litz client matches are not available in this environment.");
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

function getLocationContext(): React.Context<{
  href: string;
  pathname: string;
  search: URLSearchParams;
  hash: string;
} | null> {
  if (!locationContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Litz client location is not available in this environment.");
    }

    locationContext = createContext<{
      href: string;
      pathname: string;
      search: URLSearchParams;
      hash: string;
    } | null>(null);
  }

  return locationContext;
}

export function mountApp(element: Element, options?: MountAppOptions): void {
  const resolvedOptions = normalizeMountAppOptions(options);

  void import("react-dom/client").then(({ createRoot }) => {
    const root = createRoot(element);
    root.render(
      React.createElement(LitzApp, {
        component: resolvedOptions?.component,
        layout: resolvedOptions?.layout,
      }),
    );
  });
}

function normalizeMountAppOptions(options?: MountAppOptions): MountAppOptions | undefined {
  if (typeof options === "function") {
    console.warn(
      "[litzjs] mountApp(root, Wrapper) is no longer supported. Pass mountApp(root, { component: Wrapper }) instead.",
    );
    return undefined;
  }

  return options;
}

export function useNavigate(): (href: string, options?: { replace?: boolean }) => void {
  const context = React.useContext(getNavigationContext());

  if (!context) {
    throw new Error("useNavigate() must be used inside the Litz client runtime.");
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

export function usePathname(): string {
  const location = React.useContext(getLocationContext());

  if (!location) {
    throw new Error("usePathname() must be used inside the Litz client runtime.");
  }

  return location.pathname;
}

export function useLocation(): {
  href: string;
  pathname: string;
  search: URLSearchParams;
  hash: string;
} {
  const location = React.useContext(getLocationContext());

  if (!location) {
    throw new Error("useLocation() must be used inside the Litz client runtime.");
  }

  return location;
}

export const Link = createLinkComponent({
  useNavigate,
  prefetchRouteForHref,
});

function LitzApp(props: {
  component?: React.JSXElementConstructor<{ children: React.ReactNode }>;
  layout?: LayoutReference;
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
  const locationValue = React.useMemo(() => {
    const url = new URL(location);
    return {
      href: location,
      pathname: url.pathname,
      search: new URLSearchParams(url.search),
      hash: url.hash,
    };
  }, [location]);

  const routeHost = React.createElement(RouteHost, {
    location,
    navigate,
    component: props.component,
  });

  const content = props.layout
    ? React.createElement(props.layout.component, null, routeHost)
    : routeHost;

  return React.createElement(
    getNavigationContext().Provider,
    {
      value: navigationValue,
    },
    React.createElement(
      getLocationContext().Provider,
      {
        value: locationValue,
      },
      content,
    ),
  );
}

function RouteHost(props: {
  location: string;
  navigate(this: void, next: string, replace?: boolean): void;
  component?: React.JSXElementConstructor<{ children: React.ReactNode }>;
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

    const controller = new AbortController();
    const { loaderMatches, baseRequest } = activeRouteState;
    const finalLoaderMatchId = loaderMatches[loaderMatches.length - 1]?.id;

    const reload = async (mode: "loading" | "revalidating" = "loading") => {
      if (loaderMatches.length === 0) {
        if (!controller.signal.aborted) {
          setPageState((current) => withSettledPageState(current));
        }
        return;
      }

      setPageState((current) => applyCachedLoaderStateToPageState(current, loaderMatches, mode));

      const settled = await fetchLoaderSettledResults(loaderMatches, {
        routePath: renderedRoute.path,
        baseRequest,
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      processLoaderResults(settled, loaderMatches, {
        isCancelled: () => controller.signal.aborted,
        onResult(match, loaderResult) {
          setCachedLoaderResult(match.cacheKey, withLoaderStaleState(loaderResult, false));

          setPageState((current) => {
            return withMatchLoaderResult(
              current,
              match.id,
              renderedRoute.id,
              loaderResult,
              current.status,
              match.id === finalLoaderMatchId ? false : current.pending,
            );
          });
        },
        onRedirect(location) {
          navigate(location, true);
        },
        onRouteError(matchId, error) {
          setPageState((current) => ({
            ...current,
            status: "error",
            pending: false,
            errorInfo: error as MatchErrorInfo,
            errorTargetId: matchId,
          }));
        },
        resolveOfflineEligible(matchId) {
          const match = loaderMatches.find((entry) => entry.id === matchId);
          return (
            match?.options?.offline?.preserveStaleOnFailure === true &&
            getCachedLoaderResult(match.cacheKey) !== undefined
          );
        },
        onOfflineStale(matchId) {
          setPageState((current) => {
            const staleIds = new Set(current.offlineStaleMatchIds);
            staleIds.add(matchId);
            return {
              ...current,
              status: "offline-stale" as RouteRuntimeState["status"],
              pending: false,
              offlineStaleMatchIds: staleIds,
            };
          });
        },
        resolveHasOfflineFallback(matchId) {
          const { activeMatches } = activeRouteState;
          const matchIndex = activeMatches.findIndex((entry) => entry.id === matchId);

          for (let i = matchIndex; i >= 0; i -= 1) {
            if (activeMatches[i]?.options?.offline?.fallbackComponent) {
              return true;
            }
          }

          return false;
        },
      });
    };

    void reload();

    return () => {
      controller.abort();
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
    props.component ? React.createElement(props.component, null, content) : content,
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

type MatchErrorInfo = Extract<ActionHookResult, { kind: "fault" }>;

type LoaderDataResult = Extract<LoaderHookResult, { kind: "data" }>;
type LoaderErrorResult = Extract<LoaderHookResult, { kind: "error" }>;
type LoaderViewResult = Extract<LoaderHookResult, { kind: "view" }>;
type ActionResolvedResult = Exclude<ActionHookResult, null>;
type ActionDataResult = Extract<ActionResolvedResult, { kind: "data" }>;
type ActionErrorResult = Extract<ActionResolvedResult, { kind: "error" }>;
type ActionViewResult = Extract<ActionResolvedResult, { kind: "view" }>;
type ResultSnapshot<TResult> = {
  sequence: number;
  result: TResult;
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
    errorBoundary?: React.ComponentType<{ error: unknown }>;
    offline?: {
      fallbackComponent?: React.ComponentType;
      preserveStaleOnFailure?: boolean;
    };
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
  nextResultSequence: number;
  latestDataResult: ResultSnapshot<LoaderDataResult | ActionDataResult> | null;
  latestViewResult: ResultSnapshot<LoaderViewResult | ActionViewResult> | null;
  error: LoaderErrorResult | ActionErrorResult | null;
  status: RouteRuntimeState["status"];
  pending: boolean;
  errorInfo?: MatchErrorInfo;
  errorTargetId?: string;
  offlineStaleMatchIds?: ReadonlySet<string>;
};

function createEmptyPageState(): PageState {
  return {
    matchStates: {},
    actionResult: null,
    nextResultSequence: 1,
    latestDataResult: null,
    latestViewResult: null,
    error: null,
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
  let nextResultSequence = 1;
  let latestDataResult: PageState["latestDataResult"] = null;
  let latestViewResult: PageState["latestViewResult"] = null;
  let error: PageState["error"] = null;

  for (const match of matches) {
    if (!match.options?.loader) {
      continue;
    }

    hasAnyLoader = true;
    const cached = getCachedLoaderResult(match.cacheKey);

    if (cached) {
      hasCachedLoader = true;
      const staleCached = withLoaderStaleState(cached, true);
      matchStates[match.id] = {
        loaderResult: staleCached,
      };

      if (match.id === route.id) {
        if (staleCached.kind === "data") {
          latestDataResult = {
            sequence: nextResultSequence,
            result: staleCached,
          };
          nextResultSequence += 1;
        } else if (staleCached.kind === "view") {
          latestViewResult = {
            sequence: nextResultSequence,
            result: staleCached,
          };
          nextResultSequence += 1;
        } else if (staleCached.kind === "error") {
          error = staleCached;
        }
      }
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
      nextResultSequence,
      latestDataResult,
      latestViewResult,
      error,
      status: "idle",
      pending: false,
    };
  }

  return {
    matchStates,
    actionResult: null,
    nextResultSequence,
    latestDataResult,
    latestViewResult,
    error,
    status: hasCachedLoader ? "revalidating" : "loading",
    pending: missingLoader || hasCachedLoader,
  };
}

function withLatestDataResult(
  current: PageState,
  result: LoaderDataResult | ActionDataResult,
): PageState {
  const sequence = current.nextResultSequence;

  return {
    ...current,
    nextResultSequence: sequence + 1,
    latestDataResult: {
      sequence,
      result,
    },
  };
}

function withLatestViewResult(
  current: PageState,
  result: LoaderViewResult | ActionViewResult,
): PageState {
  const sequence = current.nextResultSequence;

  return {
    ...current,
    nextResultSequence: sequence + 1,
    latestViewResult: {
      sequence,
      result,
    },
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
    error: current.error,
    errorInfo: undefined,
    errorTargetId: undefined,
    offlineStaleMatchIds: undefined,
  };
}

function withMatchLoaderResult(
  current: PageState,
  matchId: string,
  routeId: string,
  loaderResult: LoaderHookResult,
  status: RouteRuntimeState["status"],
  pending: boolean,
): PageState {
  let nextState: PageState = {
    ...current,
    matchStates: {
      ...current.matchStates,
      [matchId]: {
        loaderResult,
      },
    },
    status,
    pending,
    error: current.error,
    errorInfo: undefined,
    errorTargetId: undefined,
  };

  if (matchId === routeId) {
    if (loaderResult.kind === "data") {
      nextState = withLatestDataResult(nextState, loaderResult);
      nextState = {
        ...nextState,
        error: null,
      };
    } else if (loaderResult.kind === "view") {
      nextState = withLatestViewResult(nextState, loaderResult);
      nextState = {
        ...nextState,
        error: null,
      };
    } else if (loaderResult.kind === "error") {
      nextState = {
        ...nextState,
        error: loaderResult,
      };
    }
  }

  if (!pending) {
    nextState = {
      ...nextState,
      status: resolveSettledPageStatus(nextState, {
        includeActionResult: false,
      }),
    };
  }

  return nextState;
}

async function reloadCurrentRoute(options: {
  route: LoadedRoute;
  pathname: string;
  search: URLSearchParams;
  navigate: (next: string, replace?: boolean) => void;
  setPageState: React.Dispatch<React.SetStateAction<PageState>>;
  mode?: "loading" | "revalidating";
  signal?: AbortSignal;
}): Promise<void> {
  const matches = buildActiveMatches(options.route, options.pathname, options.search);
  const loaderMatches = matches.filter((entry) => Boolean(entry.options?.loader));

  if (loaderMatches.length === 0) {
    options.setPageState((current) => withSettledPageState(current));
    return;
  }

  options.setPageState((current) =>
    applyCachedLoaderStateToPageState(current, loaderMatches, options.mode ?? "loading"),
  );

  const baseRequest = {
    params: extractRouteParams(options.route.path, options.pathname) ?? {},
    search: options.search,
  };

  const finalLoaderMatch = loaderMatches[loaderMatches.length - 1];

  const settled = await fetchLoaderSettledResults(loaderMatches, {
    routePath: options.route.path,
    baseRequest,
    signal: options.signal,
  });

  if (options.signal?.aborted) {
    return;
  }

  processLoaderResults(settled, loaderMatches, {
    isCancelled: () => options.signal?.aborted === true,
    onResult(match, loaderResult) {
      setCachedLoaderResult(match.cacheKey, withLoaderStaleState(loaderResult, false));
      options.setPageState((current) => {
        return withMatchLoaderResult(
          current,
          match.id,
          options.route.id,
          loaderResult,
          current.status,
          match === finalLoaderMatch ? false : current.pending,
        );
      });
    },
    onRedirect(location) {
      options.navigate(location, true);
    },
    onRouteError(matchId, error) {
      options.setPageState((current) => ({
        ...current,
        status: "error",
        pending: false,
        errorInfo: error as MatchErrorInfo,
        errorTargetId: matchId,
      }));
    },
    resolveOfflineEligible(matchId) {
      const match = loaderMatches.find((entry) => entry.id === matchId);
      return (
        match?.options?.offline?.preserveStaleOnFailure === true &&
        getCachedLoaderResult(match.cacheKey) !== undefined
      );
    },
    onOfflineStale(matchId) {
      options.setPageState((current) => {
        const staleIds = new Set(current.offlineStaleMatchIds);
        staleIds.add(matchId);
        return {
          ...current,
          status: "offline-stale" as RouteRuntimeState["status"],
          pending: false,
          offlineStaleMatchIds: staleIds,
        };
      });
    },
    resolveHasOfflineFallback(matchId) {
      const matchIndex = matches.findIndex((entry) => entry.id === matchId);

      for (let i = matchIndex; i >= 0; i -= 1) {
        if (matches[i]?.options?.offline?.fallbackComponent) {
          return true;
        }
      }

      return false;
    },
  });
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
  const offlineFallbackIndex = findOfflineFallbackIndex(matches, pageState);
  const errorBoundaryIndex =
    offlineFallbackIndex === null ? findErrorBoundaryIndex(matches, pageState) : null;

  let node: React.ReactElement | null = null;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];

    if (!match) {
      continue;
    }

    let content: React.ReactElement;

    if (offlineFallbackIndex !== null && index === offlineFallbackIndex) {
      content = React.createElement(
        match.options?.offline?.fallbackComponent as React.ComponentType,
      );
    } else if (offlineFallbackIndex !== null && index > offlineFallbackIndex) {
      continue;
    } else if (errorBoundaryIndex !== null && index === errorBoundaryIndex) {
      const ErrorComponent = match.options?.errorBoundary ?? DefaultRouteErrorPage;
      content = React.createElement(ErrorComponent as React.ComponentType<any>, {
        error: pageState.errorInfo,
      });
    } else if (errorBoundaryIndex !== null && index > errorBoundaryIndex) {
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

    if (match && match.options?.errorBoundary) {
      return index;
    }
  }

  return targetIndex;
}

function findOfflineFallbackIndex(matches: ActiveMatch[], pageState: PageState): number | null {
  if (!pageState.errorInfo || !pageState.errorTargetId) {
    return null;
  }

  if (pageState.errorInfo.status !== 0) {
    return null;
  }

  const targetIndex = matches.findIndex((match) => match.id === pageState.errorTargetId);

  if (targetIndex === -1) {
    return null;
  }

  for (let index = targetIndex; index >= 0; index -= 1) {
    const match = matches[index];

    if (match?.options?.offline?.fallbackComponent) {
      return index;
    }
  }

  return null;
}

function DefaultRouteErrorPage(props: {
  error: {
    kind: "fault";
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
  const data =
    match.kind === "route"
      ? (pageState.latestDataResult?.result.data ?? null)
      : loaderResult?.kind === "data"
        ? loaderResult.data
        : null;
  const view =
    match.kind === "route"
      ? (pageState.latestViewResult?.result.node ?? null)
      : loaderResult?.kind === "view"
        ? loaderResult.node
        : null;
  const error =
    match.kind === "route" ? pageState.error : loaderResult?.kind === "error" ? loaderResult : null;
  const submitRequestKey = React.useMemo(
    () =>
      JSON.stringify({
        params: sortRecord(match.params),
        search: sortRecord(createSearchParamRecord(match.search)),
      }),
    [match.params, match.search],
  );
  const submitSequenceRef = React.useRef(0);
  const submitControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    submitSequenceRef.current += 1;
    submitControllerRef.current?.abort();
    submitControllerRef.current = null;
  }, [submitRequestKey]);

  React.useEffect(() => {
    return () => {
      submitSequenceRef.current += 1;
      submitControllerRef.current?.abort();
      submitControllerRef.current = null;
    };
  }, []);

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

      submitControllerRef.current?.abort();
      const controller = new AbortController();
      submitControllerRef.current = controller;
      const submitSequence = submitSequenceRef.current + 1;
      submitSequenceRef.current = submitSequence;

      let result: ActionHookResult;

      try {
        result = await fetchRouteAction(
          route.path,
          {
            params: match.params,
            search: match.search,
          },
          formData,
          controller.signal,
        );
      } catch (error) {
        if (
          shouldIgnoreRouteSubmit(
            controller.signal,
            submitSequenceRef.current,
            submitSequence,
            error,
          )
        ) {
          return;
        }

        throw error;
      } finally {
        if (submitControllerRef.current === controller) {
          submitControllerRef.current = null;
        }
      }

      if (shouldIgnoreRouteSubmit(controller.signal, submitSequenceRef.current, submitSequence)) {
        return;
      }

      if (result?.kind === "redirect") {
        navigate(result.location, submitOptions?.replace ?? result.replace);
        return;
      }

      if (result?.kind === "view") {
        setPageState((current) =>
          withLatestViewResult(
            {
              ...current,
              actionResult: result,
              error: null,
              status: resolveSettledPageStatus(
                {
                  ...current,
                  actionResult: result,
                },
                {
                  ignoreLoaderMatchIds: [route.id],
                },
              ),
              pending: false,
            },
            result,
          ),
        );
      } else if (result?.kind === "data") {
        setPageState((current) =>
          withLatestDataResult(
            {
              ...current,
              actionResult: result,
              error: null,
              status: resolveSettledPageStatus(
                {
                  ...current,
                  actionResult: result,
                },
                {
                  ignoreLoaderMatchIds: [route.id],
                },
              ),
              pending: false,
            },
            result,
          ),
        );
      } else if (result) {
        setPageState((current) => ({
          ...current,
          actionResult: result,
          error: result.kind === "error" ? result : null,
          status:
            result.kind === "fault"
              ? "error"
              : resolveSettledPageStatus(
                  {
                    ...current,
                    actionResult: result,
                  },
                  {
                    ignoreLoaderMatchIds: result.kind === "invalid" ? [route.id] : undefined,
                  },
                ),
          pending: false,
          errorInfo: result.kind === "fault" ? (result as MatchErrorInfo) : current.errorInfo,
          errorTargetId: result.kind === "fault" ? route.id : current.errorTargetId,
        }));
      }

      if (result && shouldRevalidateAfterSubmit(route, result.headers, submitOptions?.revalidate)) {
        await reloadImpl("revalidating");

        if (shouldIgnoreRouteSubmit(controller.signal, submitSequenceRef.current, submitSequence)) {
          return;
        }
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
      data,
      view,
      error,
      submit,
      reload,
    }),
    [
      actionResult,
      data,
      error,
      loaderResult,
      match.id,
      match.params,
      match.search,
      pageState.pending,
      pageState.status,
      reload,
      setSearch,
      submit,
      view,
    ],
  );
}

function shouldIgnoreRouteSubmit(
  signal: AbortSignal,
  latestSequence: number,
  sequence: number,
  error?: unknown,
): boolean {
  if (signal.aborted || latestSequence !== sequence) {
    return true;
  }

  return isAbortError(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error
      ? error.name === "AbortError"
      : false;
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
  const sortedSearch = sortRecord(createSearchParamRecord(search));
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
  sortedSearch: SearchParamRecord,
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

function prefetchRouteForHref(
  href: string,
  options?: {
    target?: string | null;
    download?: string | boolean | null;
    includeData?: boolean;
    signal?: AbortSignal;
  },
): void {
  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(href, currentUrl);

  if (
    !shouldPrefetchLink({
      target: options?.target,
      download: options?.download,
      currentUrl,
      nextUrl,
    })
  ) {
    return;
  }

  const matched = findMatch(nextUrl.pathname);

  if (!matched) {
    return;
  }

  if (!options?.includeData) {
    void prefetchMatchedRouteModule(matched);
    return;
  }

  const dataPrefetchKey = createRouteDataPrefetchKey(nextUrl);
  const inFlight = routeDataPrefetchCache.get(dataPrefetchKey);

  if (inFlight) {
    return;
  }

  const prefetch = prefetchMatchedRouteModule(matched)
    .then(async (route) => {
      if (!route) {
        return;
      }

      await prefetchRouteLoaderData(route, nextUrl, options?.signal);
    })
    .finally(() => {
      routeDataPrefetchCache.delete(dataPrefetchKey);
    });

  routeDataPrefetchCache.set(dataPrefetchKey, prefetch);
}

function createRouteDataPrefetchKey(nextUrl: URL): string {
  return `${nextUrl.pathname}${nextUrl.search}`;
}

function prefetchMatchedRouteModule(
  matched: Exclude<ReturnType<typeof findMatch>, null>,
): Promise<LoadedRoute | null> {
  const cached = getCachedRouteModule(matched.entry.id);

  if (cached) {
    return Promise.resolve(cached);
  }

  const inFlight = routeModulePrefetchCache.get(matched.entry.id);

  if (inFlight) {
    return inFlight;
  }

  const prefetch = matched.entry
    .load()
    .then((loaded) => {
      if (!loaded.route) {
        return null;
      }

      setCachedRouteModule(matched.entry.id, loaded.route);
      return loaded.route;
    })
    .catch(() => {
      return null;
    })
    .finally(() => {
      routeModulePrefetchCache.delete(matched.entry.id);
    });

  routeModulePrefetchCache.set(matched.entry.id, prefetch);
  return prefetch;
}

async function prefetchRouteLoaderData(
  route: LoadedRoute,
  nextUrl: URL,
  signal?: AbortSignal,
): Promise<void> {
  const search = new URLSearchParams(nextUrl.search);
  const loaderMatches = buildActiveMatches(route, nextUrl.pathname, search).filter(
    (entry) => Boolean(entry.options?.loader) && !getCachedLoaderResult(entry.cacheKey),
  );

  if (loaderMatches.length === 0) {
    return;
  }

  const settled = await fetchLoaderSettledResults(loaderMatches, {
    routePath: route.path,
    baseRequest: {
      params: extractRouteParams(route.path, nextUrl.pathname) ?? {},
      search,
    },
    signal,
  });

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }

    setCachedLoaderResult(
      result.value.match.cacheKey,
      withLoaderStaleState(result.value.loaderResult, false),
    );
  }
}

async function fetchLoaderSettledResults(
  matches: readonly {
    readonly id: string;
    readonly cacheKey: string;
  }[],
  context: {
    routePath: string;
    baseRequest: {
      params: Record<string, string>;
      search: URLSearchParams;
    };
    signal?: AbortSignal;
  },
): Promise<readonly LoaderSettledResult[]> {
  const search = createSearchParamRecord(context.baseRequest.search);

  return Promise.allSettled(
    matches.map(async (match) => {
      const response = await fetch("/_litzjs/route", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: LITZ_RESULT_ACCEPT,
        },
        body: JSON.stringify({
          path: context.routePath,
          target: match.id,
          operation: "loader",
          request: {
            params: context.baseRequest.params,
            search,
          },
        }),
        signal: context.signal,
      });

      return {
        match,
        loaderResult: await parseLoaderResponse(response),
      };
    }),
  );
}

function withLoaderStaleState(result: LoaderHookResult, stale: boolean): LoaderHookResult {
  if (result.stale === stale) {
    return result;
  }

  if (result.kind === "data" || result.kind === "error") {
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
