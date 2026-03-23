import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { MatchedManifestEntry, RouteManifestEntry } from "../src/client/route-host-state";

import { useResolvedRouteState } from "../src/client/route-host-state";
import { flushDom, installTestDom } from "./test-dom";

type DeferredRoute<TRoute> = {
  promise: Promise<{ route: TRoute }>;
  resolve(route: TRoute): void;
};

function createDeferredRoute<TRoute>(): DeferredRoute<TRoute> {
  let resolve!: (route: TRoute) => void;

  return {
    promise: new Promise<{ route: TRoute }>((nextResolve) => {
      resolve = (route) => nextResolve({ route });
    }),
    resolve,
  };
}

type TestLayout = {
  id: string;
  component: React.ComponentType<React.PropsWithChildren>;
};

type TestRoute = {
  id: string;
  component: React.ComponentType;
  options?: {
    layout?: TestLayout;
  };
};

function renderTestRoute(route: TestRoute): React.ReactElement {
  const routeNode = React.createElement(route.component);

  if (!route.options?.layout) {
    return routeNode;
  }

  return React.createElement(route.options.layout.component, null, routeNode);
}

describe("route host state", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    const dom = installTestDom();
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    cleanupDom?.();
    cleanupDom = null;
    container = null;
    root = null;
  });

  test("keeps the current route shell mounted while the next route module loads", async () => {
    const cache = new Map<string, TestRoute>();
    const mountEvents: string[] = [];
    const deferredNextRoute = createDeferredRoute<TestRoute>();

    function SharedLayout(props: React.PropsWithChildren): React.ReactElement {
      React.useEffect(() => {
        mountEvents.push("mount");
        return () => {
          mountEvents.push("unmount");
        };
      }, []);

      return (
        <section>
          <div id="layout-state" data-value={mountEvents.join(",") || "none"} />
          {props.children}
        </section>
      );
    }

    function CurrentRoutePage() {
      return <div id="route-state" data-value="current-route" />;
    }

    function NextRoutePage() {
      return <div id="route-state" data-value="next-route" />;
    }

    const sharedLayout: TestLayout = {
      id: "shared-layout",
      component: SharedLayout,
    };

    const currentRoute: TestRoute = {
      id: "current-route",
      component: CurrentRoutePage,
      options: {
        layout: sharedLayout,
      },
    };

    const nextRoute: TestRoute = {
      id: "next-route",
      component: NextRoutePage,
      options: {
        layout: sharedLayout,
      },
    };

    const matchedEntries: Record<string, MatchedManifestEntry<TestRoute>> = {
      "https://example.com/current": {
        entry: {
          id: "current-route",
          load: async () => ({ route: currentRoute }),
        } satisfies RouteManifestEntry<TestRoute>,
      },
      "https://example.com/next": {
        entry: {
          id: "next-route",
          load: async () => deferredNextRoute.promise,
        } satisfies RouteManifestEntry<TestRoute>,
      },
    };

    function TestHarness(props: { location: string }) {
      const matched = React.useMemo(() => matchedEntries[props.location] ?? null, [props.location]);
      const createEmptyPageState = React.useCallback(
        () => ({
          routeId: null,
        }),
        [],
      );
      const createBootstrapPageState = React.useCallback(
        (route: TestRoute) => ({
          routeId: route.id,
        }),
        [],
      );
      const getCachedRoute = React.useCallback((id: string) => cache.get(id) ?? null, []);
      const setCachedRoute = React.useCallback((id: string, route: TestRoute) => {
        cache.set(id, route);
      }, []);
      const state = useResolvedRouteState<TestRoute, { routeId: string | null }>({
        matched,
        location: props.location,
        createEmptyPageState,
        createBootstrapPageState,
        getCachedRoute,
        setCachedRoute,
      });

      return (
        <div>
          <div id="display-location" data-value={state.displayLocation} />
          <div id="page-state" data-value={state.pageState.routeId ?? "none"} />
          {state.renderedRoute ? renderTestRoute(state.renderedRoute) : null}
        </div>
      );
    }

    await act(async () => {
      root?.render(<TestHarness location="https://example.com/current" />);
      await flushDom();
    });

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe(
      "current-route",
    );
    expect(document.getElementById("display-location")?.getAttribute("data-value")).toBe(
      "https://example.com/current",
    );
    expect(document.getElementById("page-state")?.getAttribute("data-value")).toBe("current-route");
    expect(mountEvents).toEqual(["mount"]);

    await act(async () => {
      root?.render(<TestHarness location="https://example.com/next" />);
      await flushDom();
    });

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe(
      "current-route",
    );
    expect(document.getElementById("display-location")?.getAttribute("data-value")).toBe(
      "https://example.com/current",
    );
    expect(document.getElementById("page-state")?.getAttribute("data-value")).toBe("current-route");
    expect(mountEvents).toEqual(["mount"]);

    deferredNextRoute.resolve(nextRoute);
    await act(async () => {
      await flushDom();
    });

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("next-route");
    expect(document.getElementById("display-location")?.getAttribute("data-value")).toBe(
      "https://example.com/next",
    );
    expect(document.getElementById("page-state")?.getAttribute("data-value")).toBe("next-route");
    expect(mountEvents).toEqual(["mount"]);
  });
});
