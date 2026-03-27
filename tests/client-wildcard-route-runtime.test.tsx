import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act } from "react";

import { data, defineRoute, server } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

type ClientModule = typeof import("../src/client/index");

let clientModule: ClientModule | null = null;
const routeSubmitEvents: string[] = [];
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
const loadBrokenRoute = mock(async () => ({
  route: {
    id: "broken-route",
    path: "/broken",
    component: BrokenRoute,
  },
}));
const loadProjectRoute = mock(async () => ({
  route: projectRoute,
}));
const submitRoute = defineRoute("/submit/:id", {
  component: SubmitRoute,
  action: server(async () => data({ value: "server" })),
});
const loadSubmitRoute = mock(async () => ({
  route: submitRoute,
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
      <Link href="/broken">Open broken route</Link>
    </main>
  );
}

function DocsRoute(): React.ReactElement {
  return <div id="route-state" data-value="wildcard-route" />;
}

function BrokenRoute(): React.ReactElement {
  return <div id="route-state" data-value="broken-route" />;
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

function SubmitRoute(): React.ReactElement {
  if (!clientModule) {
    throw new Error("Client runtime has not been loaded.");
  }

  const navigate = clientModule.useNavigate();
  const actionData = submitRoute.useActionData() as { value: string } | null;
  const submit = submitRoute.useSubmit({
    onSuccess(result) {
      routeSubmitEvents.push(`success:${String((result.data as { value?: string }).value)}`);
    },
  });

  return (
    <main>
      <div id="route-state" data-value="submit-route" />
      <div id="submit-data" data-value={actionData ? JSON.stringify(actionData) : "null"} />
      <div id="submit-status" data-value={submitRoute.useStatus()} />
      <div id="submit-pending" data-value={String(submitRoute.usePending())} />
      <div id="submit-events" data-value={routeSubmitEvents.join(",") || "(empty)"} />
      <button id="submit-first" type="button" onClick={() => void submit({ value: "first" })}>
        Submit first
      </button>
      <button id="submit-second" type="button" onClick={() => void submit({ value: "second" })}>
        Submit second
      </button>
      <button id="submit-navigate-home" type="button" onClick={() => navigate("/")}>
        Navigate home
      </button>
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
    {
      id: "broken-route",
      path: "/broken",
      load: loadBrokenRoute,
    },
    {
      id: submitRoute.id,
      path: submitRoute.path,
      load: loadSubmitRoute,
    },
  ],
}));

async function flushApp(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await flushDom();
  }
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
    loadBrokenRoute.mockClear();
    loadProjectRoute.mockClear();
    loadSubmitRoute.mockClear();
    routeSubmitEvents.length = 0;
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

  test("renders a managed route fault when a lazy route module rejects during navigation", async () => {
    loadBrokenRoute.mockImplementationOnce(async () => Promise.reject(new Error("Chunk 404")));
    clientModule = await import("../src/client/index");

    await act(async () => {
      clientModule?.mountApp(container!);
      await flushApp();
    });

    const link = container?.querySelector('a[href="/broken"]');

    expect(link).not.toBeNull();

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      await flushApp();
    });

    expect(window.location.pathname).toBe("/broken");
    expect(document.querySelector("h1")?.textContent).toBe("Route Error");
    expect(document.querySelector("p")?.textContent).toBe("fault 500: Chunk 404");
  });

  test("renders a managed route fault when a lazy route module omits the route export", async () => {
    loadBrokenRoute.mockImplementationOnce(
      async () => ({}) as Awaited<ReturnType<typeof loadBrokenRoute>>,
    );
    clientModule = await import("../src/client/index");

    await act(async () => {
      clientModule?.mountApp(container!);
      await flushApp();
    });

    const link = container?.querySelector('a[href="/broken"]');

    expect(link).not.toBeNull();

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      await flushApp();
    });

    expect(window.location.pathname).toBe("/broken");
    expect(document.querySelector("h1")?.textContent).toBe("Route Error");
    expect(document.querySelector("p")?.textContent).toBe(
      'fault 500: Route module "broken-route" does not export "route".',
    );
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

  test("keeps overlapping route submits latest-only and aborts the older request", async () => {
    window.history.replaceState(null, "", "/submit/42");

    const actionSignals: AbortSignal[] = [];
    const actionDeferreds: Array<{ resolve(response: Response): void }> = [];

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (inputUrl !== "/_litzjs/action") {
        throw new Error(`Unexpected fetch target "${inputUrl}".`);
      }

      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.body).toBeInstanceOf(FormData);
      actionSignals.push(init?.signal as AbortSignal);

      return new Promise<Response>((resolve) => {
        actionDeferreds.push({ resolve });
      });
    }) as typeof globalThis.fetch;

    clientModule = await import("../src/client/index");

    await act(async () => {
      clientModule?.mountApp(container!);
      await flushApp();
    });

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("submit-route");

    await act(async () => {
      (document.getElementById("submit-first") as HTMLButtonElement | null)?.click();
      await flushDom();
    });

    await act(async () => {
      (document.getElementById("submit-second") as HTMLButtonElement | null)?.click();
      await flushDom();
    });

    expect(actionSignals).toHaveLength(2);
    expect(actionSignals[0]?.aborted).toBe(true);
    expect(actionSignals[1]?.aborted).toBe(false);

    await act(async () => {
      actionDeferreds[1]?.resolve(
        Response.json({
          kind: "data",
          data: { value: "second" },
        }),
      );
      await flushApp();
    });

    expect(document.getElementById("submit-data")?.getAttribute("data-value")).toBe(
      JSON.stringify({ value: "second" }),
    );
    expect(document.getElementById("submit-events")?.getAttribute("data-value")).toBe(
      "success:second",
    );
    expect(document.getElementById("submit-status")?.getAttribute("data-value")).toBe("idle");
    expect(document.getElementById("submit-pending")?.getAttribute("data-value")).toBe("false");

    await act(async () => {
      actionDeferreds[0]?.resolve(
        Response.json({
          kind: "data",
          data: { value: "first" },
        }),
      );
      await flushApp();
    });

    expect(document.getElementById("submit-data")?.getAttribute("data-value")).toBe(
      JSON.stringify({ value: "second" }),
    );
    expect(document.getElementById("submit-events")?.getAttribute("data-value")).toBe(
      "success:second",
    );
  });

  test("aborts an in-flight route submit when navigation replaces the active route", async () => {
    window.history.replaceState(null, "", "/submit/42");

    let actionAborted = false;
    let resolveActionFetch: ((response: Response) => void) | null = null;

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (inputUrl !== "/_litzjs/action") {
        throw new Error(`Unexpected fetch target "${inputUrl}".`);
      }

      const signal = init?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      (signal as AbortSignal).addEventListener(
        "abort",
        () => {
          actionAborted = true;
        },
        { once: true },
      );

      return new Promise<Response>((resolve) => {
        resolveActionFetch = resolve;
      });
    }) as typeof globalThis.fetch;

    clientModule = await import("../src/client/index");

    await act(async () => {
      clientModule?.mountApp(container!);
      await flushApp();
    });

    await act(async () => {
      (document.getElementById("submit-first") as HTMLButtonElement | null)?.click();
      await flushDom();
    });

    await act(async () => {
      (document.getElementById("submit-navigate-home") as HTMLButtonElement | null)?.click();
      await flushApp();
    });

    expect(window.location.pathname).toBe("/");
    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("home-route");
    expect(actionAborted).toBe(true);

    await act(async () => {
      resolveActionFetch?.(
        Response.json({
          kind: "data",
          data: { value: "first" },
        }),
      );
      await flushApp();
    });

    expect(document.getElementById("route-state")?.getAttribute("data-value")).toBe("home-route");
    expect(routeSubmitEvents).toEqual([]);
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
