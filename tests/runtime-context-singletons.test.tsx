import { describe, expect, test } from "bun:test";
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

async function withoutConsoleError(callback: () => Promise<void>): Promise<void> {
  const originalConsoleError = console.error;

  console.error = () => {};

  try {
    await callback();
  } finally {
    console.error = originalConsoleError;
  }
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

class ErrorBoundary extends React.Component<
  {
    onError(error: unknown): void;
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): React.ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}

describe("runtime context isolation", () => {
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

      function ReaderB(): React.ReactElement {
        const routeId = routeRuntimeB.useRequiredRouteLocation("/projects/:id").id;
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

      const errors: unknown[] = [];

      await withoutConsoleError(async () => {
        await act(async () => {
          root.render(
            <ErrorBoundary onError={(error) => errors.push(error)}>
              <routeRuntimeA.RouteRuntimeProvider value={createRouteRuntimeState()}>
                <ReaderB />
              </routeRuntimeA.RouteRuntimeProvider>
            </ErrorBoundary>,
          );
          await flushDom();
        });
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toBe(
        'Route "/projects/:id" is being used outside the Litz runtime.',
      );

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

      function ReaderB(): React.ReactElement {
        const resourceId =
          resourceRuntimeB.useRequiredResourceLocation("/resources/projects/:id").id;
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

      const errors: unknown[] = [];

      await withoutConsoleError(async () => {
        await act(async () => {
          root.render(
            <ErrorBoundary onError={(error) => errors.push(error)}>
              <resourceRuntimeA.ResourceRuntimeProvider value={createResourceRuntimeState()}>
                <ReaderB />
              </resourceRuntimeA.ResourceRuntimeProvider>
            </ErrorBoundary>,
          );
          await flushDom();
        });
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toBe(
        'Resource "/resources/projects/:id" is being used outside its resource component.',
      );

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
