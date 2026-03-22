export function resolveRouteModuleLoadState<TLoadedRoute, TPageState>(options: {
  matched: boolean;
  cachedRoute: TLoadedRoute | null;
  previousRoute: TLoadedRoute | null;
  nextLocation: string;
  createEmptyPageState(): TPageState;
  createBootstrapPageState(route: TLoadedRoute): TPageState;
}):
  | {
      kind: "not-found";
      loadedRoute: null;
      displayLocation: string;
      pageState: TPageState;
    }
  | {
      kind: "cached";
      loadedRoute: TLoadedRoute;
      displayLocation: string;
      pageState: TPageState;
    }
  | {
      kind: "preserve-current";
    }
  | {
      kind: "reset-before-load";
      loadedRoute: null;
      displayLocation: string;
      pageState: TPageState;
    } {
  if (!options.matched) {
    return {
      kind: "not-found",
      loadedRoute: null,
      displayLocation: options.nextLocation,
      pageState: options.createEmptyPageState(),
    };
  }

  if (options.cachedRoute) {
    return {
      kind: "cached",
      loadedRoute: options.cachedRoute,
      displayLocation: options.nextLocation,
      pageState: options.createBootstrapPageState(options.cachedRoute),
    };
  }

  if (options.previousRoute) {
    return {
      kind: "preserve-current",
    };
  }

  return {
    kind: "reset-before-load",
    loadedRoute: null,
    displayLocation: options.nextLocation,
    pageState: options.createEmptyPageState(),
  };
}

export function resolveLoadedRouteState<TLoadedRoute, TPageState>(options: {
  loadedRoute: TLoadedRoute;
  nextLocation: string;
  createBootstrapPageState(route: TLoadedRoute): TPageState;
}): {
  loadedRoute: TLoadedRoute;
  displayLocation: string;
  pageState: TPageState;
} {
  return {
    loadedRoute: options.loadedRoute,
    displayLocation: options.nextLocation,
    pageState: options.createBootstrapPageState(options.loadedRoute),
  };
}
