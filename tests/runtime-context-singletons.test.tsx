import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { ResourceRuntimeState } from "../src/client/resources";
import type { RouteRuntimeState } from "../src/client/route-runtime";

import { flushDom, installTestDom } from "./test-dom";

const routeRuntimeGlobalKeys = [
  "__litzjsRouteLocationContext",
  "__litzjsRouteStatusContext",
  "__litzjsRouteDataContext",
  "__litzjsRouteActionsContext",
] as const;

const resourceRuntimeGlobalKeys = [
  "__litzjsResourceLocationContext",
  "__litzjsResourceStatusContext",
  "__litzjsResourceDataContext",
  "__litzjsResourceActionsContext",
] as const;

async function importFresh<TModule>(path: string): Promise<TModule> {
  return (await import(`${path}?fresh=${Math.random().toString(36).slice(2)}`)) as TModule;
}

function createRouteRuntimeState(): RouteRuntimeState {
  return {
    id: "/projects/:id",
    params: {
      id: "123",
    },
    search: new URLSearchParams("tab=overview"),
    setSearch() {},
    status: "idle",
    pending: false,
    loaderResult: null,
    actionResult: null,
    data: null,
    view: null,
    error: null,
    async submit() {},
    reload() {},
  };
}

function createResourceRuntimeState(): ResourceRuntimeState {
  return {
    id: "/resources/projects/:id",
    params: {
      id: "123",
    },
    search: new URLSearchParams("tab=overview"),
    setSearch() {},
    status: "idle",
    pending: false,
    loaderResult: null,
    actionResult: null,
    data: null,
    view: null,
    error: null,
    async submit() {},
    reload() {},
  };
}

describe("runtime context singletons", () => {
  afterEach(() => {
    for (const key of [...routeRuntimeGlobalKeys, ...resourceRuntimeGlobalKeys]) {
      delete globalThis[key];
    }
  });

  test("route runtime contexts survive hot re-imports", async () => {
    const dom = installTestDom();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      const routeRuntimeA = await importFresh<typeof import("../src/client/route-runtime")>(
        "../src/client/route-runtime",
      );
      const routeRuntimeB = await importFresh<typeof import("../src/client/route-runtime")>(
        "../src/client/route-runtime",
      );
      const observedRouteId: { current: string | null } = { current: null };

      function Reader(): React.ReactElement {
        observedRouteId.current = routeRuntimeB.useRequiredRouteLocation("/projects/:id").id;
        return <div data-route-id={observedRouteId.current} />;
      }

      await act(async () => {
        root.render(
          <routeRuntimeA.RouteRuntimeProvider value={createRouteRuntimeState()}>
            <Reader />
          </routeRuntimeA.RouteRuntimeProvider>,
        );
        await flushDom();
      });

      expect(observedRouteId.current).toEqual("/projects/:id");
      expect(globalThis.__litzjsRouteLocationContext).toBeDefined();
      expect(globalThis.__litzjsRouteActionsContext).toBeDefined();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      dom.cleanup();
    }
  });

  test("resource runtime contexts survive hot re-imports", async () => {
    const dom = installTestDom();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      const resourceRuntimeA =
        await importFresh<typeof import("../src/client/resources")>("../src/client/resources");
      const resourceRuntimeB =
        await importFresh<typeof import("../src/client/resources")>("../src/client/resources");
      const observedResourceId: { current: string | null } = { current: null };

      function Reader(): React.ReactElement {
        observedResourceId.current =
          resourceRuntimeB.useRequiredResourceLocation("/resources/projects/:id").id;
        return <div data-resource-id={observedResourceId.current} />;
      }

      await act(async () => {
        root.render(
          <resourceRuntimeA.ResourceRuntimeProvider value={createResourceRuntimeState()}>
            <Reader />
          </resourceRuntimeA.ResourceRuntimeProvider>,
        );
        await flushDom();
      });

      expect(observedResourceId.current).toEqual("/resources/projects/:id");
      expect(globalThis.__litzjsResourceLocationContext).toBeDefined();
      expect(globalThis.__litzjsResourceActionsContext).toBeDefined();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      dom.cleanup();
    }
  });
});
