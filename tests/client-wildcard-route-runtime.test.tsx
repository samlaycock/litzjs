import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act } from "react";

import { data, defineRoute, server } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

type ClientModule = typeof import("../src/client/index");

let clientModule: ClientModule | null = null;
const projectRoute = defineRoute("/projects/:id", {
  component: ProjectRoute,
  loader: server(() =>
    data({
      id: "0",
      tab: null,
    }),
  ),
});
const loadHomeRoute = mock(async () => ({
  route: {
    id: "home-route",
    path: "/",
    component: HomeRoute,
  },
}));
const loadDocsRoute = mock(async () => ({
  route: {
    id: "docs-route",
    path: "/docs/*slug",
    component: DocsRoute,
  },
}));
const loadProjectRoute = mock(async () => ({
  route: projectRoute,
}));

function HomeRoute(): React.ReactElement {
  if (!clientModule) {
    throw new Error("Client runtime has not been loaded.");
  }

  const Link = clientModule.Link;

  return (
    <main>
      <div id="route-state" data-value="home-route" />
      <Link href="/docs/getting-started/install">Open docs wildcard route</Link>
      <Link href="/projects/42?tab=activity" prefetchData>
        Open project route
      </Link>
    </main>
  );
}

function DocsRoute(): React.ReactElement {
  return <div id="route-state" data-value="wildcard-route" />;
}

function ProjectRoute(): React.ReactElement {
  const details = projectRoute.useLoaderData() as {
    id: string;
    tab: string | null;
    source?: string;
  } | null;

  return (
    <main>
      <div id="route-state" data-value="project-route" />
      <div id="loader-data" data-value={details ? JSON.stringify(details) : "null"} />
      <div id="status-state" data-value={projectRoute.useStatus()} />
      <div id="pending-state" data-value={String(projectRoute.usePending())} />
    </main>
  );
}

void mock.module("virtual:litzjs:route-manifest", () => ({
  routeManifest: [
    {
      id: "home-route",
      path: "/",
      load: loadHomeRoute,
    },
    {
      id: "docs-route",
      path: "/docs/*slug",
      load: loadDocsRoute,
    },
    {
      id: projectRoute.id,
      path: projectRoute.path,
      load: loadProjectRoute,
    },
  ],
}));

async function flushApp(): Promise<void> {
  await flushDom();
  await flushDom();
  await flushDom();
}

describe("client wildcard route runtime", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    const dom = installTestDom("https://example.com/");
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    clientModule = null;
    loadHomeRoute.mockClear();
    loadDocsRoute.mockClear();
    loadProjectRoute.mockClear();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    container?.remove();
    cleanupDom?.();
    cleanupDom = null;
    container = null;
    clientModule = null;
  });

  test("prefetches and navigates to wildcard routes through the client manifest", async () => {
    clientModule = await import("../src/client/index");

    await act(async () => {
      clientModule?.mountApp(container!);
      await flushApp();
    });

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("home-route");
    expect(loadHomeRoute).toHaveBeenCalledTimes(1);

    const link = container?.getElementsByTagName("a")[0] ?? null;

    expect(link).not.toBeNull();

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await flushApp();
    });

    expect(loadDocsRoute).toHaveBeenCalledTimes(1);

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      await flushApp();
    });

    expect(window.location.pathname).toBe("/docs/getting-started/install");
    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe(
      "wildcard-route",
    );
    expect(loadDocsRoute).toHaveBeenCalledTimes(1);
  });

  test("uses prefetched loader data immediately on navigation while revalidating in the background", async () => {
    let loaderCallCount = 0;
    let resolveReloadFetch: (() => void) | null = null;

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (inputUrl !== "/_litzjs/route") {
        throw new Error(`Unexpected fetch target "${inputUrl}".`);
      }

      if (typeof init?.body !== "string") {
        throw new Error("Expected route loader request body to be a JSON string.");
      }

      loaderCallCount += 1;

      const request = JSON.parse(init.body) as {
        path: string;
        target: string;
        operation: string;
        request: {
          params: Record<string, string>;
          search: Record<string, string>;
        };
      };

      expect(request.path).toBe("/projects/:id");
      expect(request.target).toBe("/projects/:id");
      expect(request.operation).toBe("loader");
      expect(request.request.params).toEqual({
        id: "42",
      });
      expect(request.request.search).toEqual({
        tab: "activity",
      });

      if (loaderCallCount === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              kind: "data",
              data: { id: "42", tab: "activity", source: "prefetch" },
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        );
      }

      return new Promise<Response>((resolve) => {
        resolveReloadFetch = () =>
          resolve(
            new Response(
              JSON.stringify({
                kind: "data",
                data: { id: "42", tab: "activity", source: "reload" },
              }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              },
            ),
          );
      });
    }) as typeof globalThis.fetch;

    clientModule = await import("../src/client/index");

    await act(async () => {
      clientModule?.mountApp(container!);
      await flushApp();
    });

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("home-route");

    const link = container?.getElementsByTagName("a")[1] ?? null;

    expect(link).not.toBeNull();

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await flushApp();
    });

    expect(loadProjectRoute).toHaveBeenCalledTimes(1);
    expect(loaderCallCount).toBe(1);

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      await flushDom();
    });

    expect(window.location.pathname).toBe("/projects/42");
    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe(
      "project-route",
    );
    expect(document.getElementById("loader-data")?.getAttribute("data-value")).toBe(
      JSON.stringify({ id: "42", tab: "activity", source: "prefetch" }),
    );
    expect(document.getElementById("status-state")?.getAttribute("data-value")).toBe(
      "revalidating",
    );
    expect(document.getElementById("pending-state")?.getAttribute("data-value")).toBe("true");
    expect(loaderCallCount).toBe(2);

    await act(async () => {
      resolveReloadFetch?.();
      await flushApp();
    });

    expect(document.getElementById("loader-data")?.getAttribute("data-value")).toBe(
      JSON.stringify({ id: "42", tab: "activity", source: "reload" }),
    );
    expect(document.getElementById("status-state")?.getAttribute("data-value")).toBe("idle");
    expect(document.getElementById("pending-state")?.getAttribute("data-value")).toBe("false");
  });

  test("mounts wrapper components from the options object", async () => {
    clientModule = await import("../src/client/index");

    function TestWrapper({ children }: React.PropsWithChildren): React.ReactElement {
      return <div data-wrapper="options-object">{children}</div>;
    }

    await act(async () => {
      clientModule?.mountApp(container!, { component: TestWrapper });
      await flushApp();
    });

    expect(container?.querySelector('[data-wrapper="options-object"]')).not.toBeNull();
    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("home-route");
  });

  test("warns when passed a wrapper component instead of the options object", async () => {
    clientModule = await import("../src/client/index");

    const originalConsoleWarn = console.warn;
    const warnings: string[] = [];

    function LegacyWrapper({ children }: React.PropsWithChildren): React.ReactElement {
      return <div data-wrapper="legacy">{children}</div>;
    }

    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    try {
      await act(async () => {
        clientModule?.mountApp(
          container!,
          LegacyWrapper as unknown as Parameters<ClientModule["mountApp"]>[1],
        );
        await flushApp();
      });
    } finally {
      console.warn = originalConsoleWarn;
    }

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("home-route");
    expect(container?.querySelector('[data-wrapper="legacy"]')).toBeNull();
    expect(warnings).toEqual([
      "[litzjs] mountApp(root, Wrapper) is no longer supported. Pass mountApp(root, { component: Wrapper }) instead.",
    ]);
  });
});
