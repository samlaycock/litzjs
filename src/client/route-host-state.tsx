import * as React from "react";

import { resolveLoadedRouteState, resolveRouteModuleLoadState } from "./route-transition";

export type RouteManifestLoadResult<TRoute> = {
  route?: TRoute;
};

export type RouteManifestEntry<TRoute> = {
  id: string;
  load(): Promise<RouteManifestLoadResult<TRoute>>;
};

export type MatchedManifestEntry<TRoute> = {
  entry: RouteManifestEntry<TRoute>;
} | null;

export type RouteLoadFailureState<TRoute, TPageState> = {
  displayLocation: string;
  renderedRoute: TRoute | null;
  pageState: TPageState;
};

export function useResolvedRouteState<TRoute, TPageState>(options: {
  matched: MatchedManifestEntry<TRoute>;
  location: string;
  createEmptyPageState(this: void): TPageState;
  createBootstrapPageState(this: void, route: TRoute): TPageState;
  getCachedRoute(this: void, id: string): TRoute | null;
  setCachedRoute(this: void, id: string, route: TRoute): void;
  resolveRouteLoadFailureState?(
    this: void,
    error: unknown,
    previousRoute: TRoute | null,
  ): RouteLoadFailureState<TRoute, TPageState>;
}): {
  displayLocation: string;
  renderedRoute: TRoute | null;
  pageState: TPageState;
  setPageState: React.Dispatch<React.SetStateAction<TPageState>>;
} {
  const createEmptyPageState = options.createEmptyPageState;
  const createBootstrapPageState = options.createBootstrapPageState;
  const getCachedRoute = options.getCachedRoute;
  const setCachedRoute = options.setCachedRoute;
  const resolveRouteLoadFailureState = options.resolveRouteLoadFailureState;
  const [displayLocation, setDisplayLocation] = React.useState(() => options.location);
  const [renderedRoute, setRenderedRoute] = React.useState<TRoute | null>(null);
  const [pageState, setPageState] = React.useState<TPageState>(() => createEmptyPageState());
  const renderedRouteRef = React.useRef<TRoute | null>(null);

  React.useEffect(() => {
    renderedRouteRef.current = renderedRoute;
  }, [renderedRoute]);

  React.useLayoutEffect(() => {
    let cancelled = false;

    async function loadRouteModule(): Promise<void> {
      const routeState = resolveRouteModuleLoadState({
        matched: Boolean(options.matched),
        cachedRoute: options.matched ? getCachedRoute(options.matched.entry.id) : null,
        previousRoute: renderedRouteRef.current,
        nextLocation: options.location,
        createEmptyPageState: () => createEmptyPageState(),
        createBootstrapPageState: (route) => createBootstrapPageState(route),
      });

      if (routeState.kind === "not-found") {
        setRenderedRoute(routeState.loadedRoute);
        setDisplayLocation(routeState.displayLocation);
        setPageState(routeState.pageState);
        return;
      }

      if (routeState.kind === "cached") {
        setPageState(routeState.pageState);
        setRenderedRoute(routeState.loadedRoute);
        setDisplayLocation(routeState.displayLocation);
        return;
      }

      if (routeState.kind === "reset-before-load") {
        setRenderedRoute(routeState.loadedRoute);
        setDisplayLocation(routeState.displayLocation);
        setPageState(routeState.pageState);
      }

      const matchedEntry = options.matched?.entry;

      if (!matchedEntry) {
        return;
      }

      try {
        const loaded = await matchedEntry.load();

        if (cancelled) {
          return;
        }

        if (!loaded.route) {
          throw new Error(`Route module "${matchedEntry.id}" does not export "route".`);
        }

        setCachedRoute(matchedEntry.id, loaded.route);
        const loadedRouteState = resolveLoadedRouteState({
          loadedRoute: loaded.route,
          nextLocation: options.location,
          createBootstrapPageState: (route) => createBootstrapPageState(route),
        });
        setPageState(loadedRouteState.pageState);
        setRenderedRoute(loadedRouteState.loadedRoute);
        setDisplayLocation(loadedRouteState.displayLocation);
      } catch (error) {
        if (cancelled || !resolveRouteLoadFailureState) {
          throw error;
        }

        const failedRouteState = resolveRouteLoadFailureState(error, renderedRouteRef.current);
        setRenderedRoute(failedRouteState.renderedRoute);
        setDisplayLocation(failedRouteState.displayLocation);
        setPageState(failedRouteState.pageState);
      }
    }

    void loadRouteModule();

    return () => {
      cancelled = true;
    };
  }, [
    createBootstrapPageState,
    createEmptyPageState,
    getCachedRoute,
    options.location,
    options.matched,
    resolveRouteLoadFailureState,
    setCachedRoute,
  ]);

  return {
    displayLocation,
    renderedRoute,
    pageState,
    setPageState,
  };
}
