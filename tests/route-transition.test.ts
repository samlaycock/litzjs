import { describe, expect, test } from "bun:test";

import {
  resolveLoadedRouteState,
  resolveRouteModuleLoadState,
} from "../src/client/route-transition";

describe("route module transitions", () => {
  test("preserves the current route shell while an uncached next route module loads", () => {
    expect(
      resolveRouteModuleLoadState<{ id: string }, { status: string; routeId?: string }>({
        matched: true,
        cachedRoute: null,
        previousRoute: { id: "current-route" },
        nextLocation: "https://example.com/next",
        createEmptyPageState() {
          return { status: "loading" };
        },
        createBootstrapPageState(route) {
          return { status: "idle", routeId: route.id };
        },
      }),
    ).toEqual({
      kind: "preserve-current",
    });
  });

  test("boots immediately from a cached route module", () => {
    expect(
      resolveRouteModuleLoadState<{ id: string }, { status: string; routeId?: string }>({
        matched: true,
        cachedRoute: { id: "cached-route" },
        previousRoute: { id: "current-route" },
        nextLocation: "https://example.com/next",
        createEmptyPageState() {
          return { status: "loading" };
        },
        createBootstrapPageState(route) {
          return { status: "idle", routeId: route.id };
        },
      }),
    ).toEqual({
      kind: "cached",
      loadedRoute: { id: "cached-route" },
      displayLocation: "https://example.com/next",
      pageState: { status: "idle", routeId: "cached-route" },
    });
  });

  test("resets only when there is no previous route to keep mounted", () => {
    expect(
      resolveRouteModuleLoadState<{ id: string }, { status: string; routeId?: string }>({
        matched: true,
        cachedRoute: null,
        previousRoute: null,
        nextLocation: "https://example.com/next",
        createEmptyPageState() {
          return { status: "loading" };
        },
        createBootstrapPageState(route) {
          return { status: "idle", routeId: route.id };
        },
      }),
    ).toEqual({
      kind: "reset-before-load",
      loadedRoute: null,
      displayLocation: "https://example.com/next",
      pageState: { status: "loading" },
    });
  });

  test("switches to the newly loaded route once the module is ready", () => {
    expect(
      resolveLoadedRouteState<{ id: string }, { status: string; routeId?: string }>({
        loadedRoute: { id: "next-route" },
        nextLocation: "https://example.com/next",
        createBootstrapPageState(route) {
          return { status: "idle", routeId: route.id };
        },
      }),
    ).toEqual({
      loadedRoute: { id: "next-route" },
      displayLocation: "https://example.com/next",
      pageState: { status: "idle", routeId: "next-route" },
    });
  });
});
