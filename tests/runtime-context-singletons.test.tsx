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

describe("runtime context isolation", () => {
  afterEach(() => {
    for (const key of [...routeRuntimeGlobalKeys, ...resourceRuntimeGlobalKeys]) {
      Reflect.deleteProperty(globalThis, key);
    }
  });

  test("route runtime contexts stay module-local across fresh imports", async () => {
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
      const observedRouteIds: string[] = [];

      expect(routeRuntimeA.RouteRuntimeProvider).not.toBe(routeRuntimeB.RouteRuntimeProvider);

      function ReaderA(): React.ReactElement {
        const routeId = routeRuntimeA.useRequiredRouteLocation("/projects/:id").id;
        observedRouteIds.push(routeId);
        return <div data-route-id={routeId} />;
      }

      await act(async () => {
        root.render(
          <routeRuntimeA.RouteRuntimeProvider value={createRouteRuntimeState()}>
            <ReaderA />
          </routeRuntimeA.RouteRuntimeProvider>,
        );
        await flushDom();
      });

      expect(observedRouteIds).toEqual(["/projects/:id"]);
      for (const key of routeRuntimeGlobalKeys) {
        expect(key in globalThis).toBe(false);
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      dom.cleanup();
    }
  });

  test("resource runtime contexts stay module-local across fresh imports", async () => {
    const dom = installTestDom();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      const resourceRuntimeA =
        await importFresh<typeof import("../src/client/resources")>("../src/client/resources");
      const resourceRuntimeB =
        await importFresh<typeof import("../src/client/resources")>("../src/client/resources");
      const observedResourceIds: string[] = [];

      expect(resourceRuntimeA.ResourceRuntimeProvider).not.toBe(
        resourceRuntimeB.ResourceRuntimeProvider,
      );

      function ReaderA(): React.ReactElement {
        const resourceId =
          resourceRuntimeA.useRequiredResourceLocation("/resources/projects/:id").id;
        observedResourceIds.push(resourceId);
        return <div data-resource-id={resourceId} />;
      }

      await act(async () => {
        root.render(
          <resourceRuntimeA.ResourceRuntimeProvider value={createResourceRuntimeState()}>
            <ReaderA />
          </resourceRuntimeA.ResourceRuntimeProvider>,
        );
        await flushDom();
      });

      expect(observedResourceIds).toEqual(["/resources/projects/:id"]);
      for (const key of resourceRuntimeGlobalKeys) {
        expect(key in globalThis).toBe(false);
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      dom.cleanup();
    }
  });
});
