import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { RouteRuntimeState } from "../src/client/route-runtime";

import { installClientBindings, resetClientBindings } from "../src/client/bindings";
import { createResourceComponent, createResourceFormComponent } from "../src/client/resources";
import {
  RouteRuntimeProvider,
  createRouteFormComponent,
  useRequiredRouteActions,
  useRequiredRouteData,
  useRequiredRouteLocation,
  useRequiredRouteStatus,
} from "../src/client/route-runtime";
import { data, defineRoute, error, invalid, server, view } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

const route: any = defineRoute("/projects", {
  component() {
    return null;
  },
  loader: server(async () => data({ count: 1 })),
  action: server(async () => data({ saved: true })),
});

const nextRoute: any = defineRoute("/projects/next", {
  component() {
    return null;
  },
  loader: server(async () => data({ label: "next" })),
});

function installRuntimeBindings(): void {
  installClientBindings({
    usePathname() {
      return window.location.pathname;
    },
    useLocation() {
      return {
        href: window.location.href,
        pathname: window.location.pathname,
        search: new URLSearchParams(window.location.search),
        hash: window.location.hash,
      };
    },
    useRequiredRouteLocation,
    useRequiredRouteStatus,
    useRequiredRouteData,
    useRequiredRouteActions,
    useRequiredResourceLocation() {
      throw new Error("Resource location runtime is not used in route result hook tests.");
    },
    useRequiredResourceStatus() {
      throw new Error("Resource status runtime is not used in route result hook tests.");
    },
    useRequiredResourceData() {
      throw new Error("Resource data runtime is not used in route result hook tests.");
    },
    useRequiredResourceActions() {
      throw new Error("Resource actions runtime is not used in route result hook tests.");
    },
    useMatches() {
      return [];
    },
    createRouteFormComponent,
    createResourceFormComponent,
    createResourceComponent,
  });
}

function createRuntimeState(overrides: Partial<RouteRuntimeState> = {}): RouteRuntimeState {
  return {
    id: "/projects",
    params: {},
    search: new URLSearchParams(),
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
    ...overrides,
  };
}

function HookProbe(): React.ReactElement {
  const loaderResult = route.useLoaderResult();
  const loaderData = route.useLoaderData();
  const loaderView = route.useLoaderView();
  const loaderError = route.useLoaderError();
  const actionResult = route.useActionResult();
  const actionData = route.useActionData();
  const actionView = route.useActionView();
  const actionError = route.useActionError();
  const invalidResult = route.useInvalid();
  const mergedData = route.useData();
  const mergedView = route.useView();
  const mergedError = route.useError();

  return (
    <main>
      <div id="loader-result-kind" data-value={loaderResult?.kind ?? "null"} />
      <div id="loader-data" data-value={String(loaderData ? JSON.stringify(loaderData) : "null")} />
      <div id="loader-view" data-value={loaderView ? "present" : "null"}>
        {loaderView}
      </div>
      <div id="loader-error" data-value={loaderError?.message ?? "null"} />
      <div id="action-result-kind" data-value={actionResult?.kind ?? "null"} />
      <div id="action-data" data-value={String(actionData ? JSON.stringify(actionData) : "null")} />
      <div id="action-view" data-value={actionView ? "present" : "null"}>
        {actionView}
      </div>
      <div id="action-error" data-value={actionError?.message ?? "null"} />
      <div
        id="invalid"
        data-value={invalidResult?.formError ?? invalidResult?.fields?.name ?? "null"}
      />
      <div id="merged-data" data-value={String(mergedData ? JSON.stringify(mergedData) : "null")} />
      <div id="merged-view" data-value={mergedView ? "present" : "null"}>
        {mergedView}
      </div>
      <div id="merged-error" data-value={mergedError?.message ?? "null"} />
    </main>
  );
}

function NextRouteHookProbe(): React.ReactElement {
  const loaderResult = nextRoute.useLoaderResult();
  const loaderData = nextRoute.useLoaderData();
  const loaderError = nextRoute.useLoaderError();
  const actionResult = nextRoute.useActionResult?.();
  const mergedData = nextRoute.useData();
  const mergedView = nextRoute.useView();
  const mergedError = nextRoute.useError?.();

  return (
    <main>
      <div id="next-loader-result-kind" data-value={loaderResult?.kind ?? "null"} />
      <div
        id="next-loader-data"
        data-value={String(loaderData ? JSON.stringify(loaderData) : "null")}
      />
      <div id="next-loader-error" data-value={loaderError?.message ?? "null"} />
      <div id="next-action-result-kind" data-value={actionResult?.kind ?? "null"} />
      <div
        id="next-merged-data"
        data-value={String(mergedData ? JSON.stringify(mergedData) : "null")}
      />
      <div id="next-merged-view" data-value={mergedView ? "present" : "null"}>
        {mergedView}
      </div>
      <div id="next-merged-error" data-value={mergedError?.message ?? "null"} />
    </main>
  );
}

describe("route result hooks", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    const dom = installTestDom();
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    installRuntimeBindings();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    resetClientBindings();
    container?.remove();
    cleanupDom?.();
    cleanupDom = null;
    container = null;
    root = null;
  });

  test("returns null for unresolved loader and action hooks", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider value={createRuntimeState()}>
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("loader-result-kind")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("loader-data")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("loader-view")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("loader-error")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("action-result-kind")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("action-data")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("action-view")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("action-error")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("invalid")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("merged-data")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("merged-view")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("merged-error")?.getAttribute("data-value")).toBe("null");
  });

  test("exposes loader data and invalid action state independently", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            loaderResult: {
              kind: "data",
              status: 200,
              headers: new Headers(),
              stale: false,
              data: {
                count: 3,
              },
              render() {
                return null;
              },
            },
            actionResult: invalid({
              fields: {
                name: "Name is required",
              },
            }) as RouteRuntimeState["actionResult"],
            data: {
              count: 3,
            },
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("loader-result-kind")?.getAttribute("data-value")).toBe("data");
    expect(document.getElementById("loader-data")?.getAttribute("data-value")).toContain(
      '"count":3',
    );
    expect(document.getElementById("action-result-kind")?.getAttribute("data-value")).toBe(
      "invalid",
    );
    expect(document.getElementById("invalid")?.getAttribute("data-value")).toBe("Name is required");
    expect(document.getElementById("action-data")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("merged-data")?.getAttribute("data-value")).toContain(
      '"count":3',
    );
  });

  test("surfaces explicit loader errors through useLoaderError() and useError()", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            loaderResult: error(404, "Project not found") as RouteRuntimeState["loaderResult"],
            error: error(404, "Project not found") as RouteRuntimeState["error"],
            status: "error",
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("loader-result-kind")?.getAttribute("data-value")).toBe("error");
    expect(document.getElementById("loader-error")?.getAttribute("data-value")).toBe(
      "Project not found",
    );
    expect(document.getElementById("merged-error")?.getAttribute("data-value")).toBe(
      "Project not found",
    );
  });

  test("keeps loader and action views separate while exposing the merged view", async () => {
    const actionNode = <span id="action-node">Action view</span>;

    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            loaderResult: {
              kind: "data",
              status: 200,
              headers: new Headers(),
              stale: false,
              data: {
                count: 7,
              },
              render() {
                return null;
              },
            },
            actionResult: view(actionNode) as RouteRuntimeState["actionResult"],
            data: {
              count: 7,
            },
            view: actionNode,
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("loader-view")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("action-view")?.getAttribute("data-value")).toBe("present");
    expect(document.getElementById("merged-view")?.getAttribute("data-value")).toBe("present");
    expect(document.getElementById("action-node")?.textContent).toBe("Action view");
  });

  test("prefers newer action data over loader data in merged useData()", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            loaderResult: {
              kind: "data",
              status: 200,
              headers: new Headers(),
              stale: false,
              data: {
                count: 11,
              },
              render() {
                return null;
              },
            },
            actionResult: data({
              saved: true,
            }) as RouteRuntimeState["actionResult"],
            data: {
              saved: true,
            },
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("loader-data")?.getAttribute("data-value")).toContain(
      '"count":11',
    );
    expect(document.getElementById("action-data")?.getAttribute("data-value")).toContain(
      '"saved":true',
    );
    expect(document.getElementById("merged-data")?.getAttribute("data-value")).toContain(
      '"saved":true',
    );
    expect(document.getElementById("merged-data")?.getAttribute("data-value")).not.toContain(
      '"count":11',
    );
  });

  test("surfaces explicit action errors through useActionError() and useError()", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: error(
              422,
              "Project name is invalid",
            ) as RouteRuntimeState["actionResult"],
            error: error(422, "Project name is invalid") as RouteRuntimeState["error"],
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("action-error")?.getAttribute("data-value")).toBe(
      "Project name is invalid",
    );
    expect(document.getElementById("merged-error")?.getAttribute("data-value")).toBe(
      "Project name is invalid",
    );
  });

  test("clears useInvalid() after a subsequent successful action", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: invalid({
              fields: {
                name: "Name is required",
              },
            }) as RouteRuntimeState["actionResult"],
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("invalid")?.getAttribute("data-value")).toBe("Name is required");

    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: data({
              saved: true,
            }) as RouteRuntimeState["actionResult"],
            data: {
              saved: true,
            },
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("action-result-kind")?.getAttribute("data-value")).toBe("data");
    expect(document.getElementById("invalid")?.getAttribute("data-value")).toBe("null");
  });

  test("clears useActionError() and useError() after a subsequent successful action", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: error(
              422,
              "Project name is invalid",
            ) as RouteRuntimeState["actionResult"],
            error: error(422, "Project name is invalid") as RouteRuntimeState["error"],
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("action-error")?.getAttribute("data-value")).toBe(
      "Project name is invalid",
    );
    expect(document.getElementById("merged-error")?.getAttribute("data-value")).toBe(
      "Project name is invalid",
    );

    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: data({
              saved: true,
            }) as RouteRuntimeState["actionResult"],
            data: {
              saved: true,
            },
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("action-error")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("merged-error")?.getAttribute("data-value")).toBe("null");
  });

  test("clears merged useView() after a newer non-view result wins on the same route", async () => {
    const actionNode = <span id="stale-view">Action view</span>;

    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: view(actionNode) as RouteRuntimeState["actionResult"],
            view: actionNode,
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("merged-view")?.getAttribute("data-value")).toBe("present");
    expect(document.getElementById("stale-view")?.textContent).toBe("Action view");

    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            loaderResult: {
              kind: "data",
              status: 200,
              headers: new Headers(),
              stale: false,
              data: {
                count: 20,
              },
              render() {
                return null;
              },
            },
            data: {
              count: 20,
            },
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("loader-data")?.getAttribute("data-value")).toContain(
      '"count":20',
    );
    expect(document.getElementById("merged-view")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("stale-view")).toBeNull();
  });

  test("clears prior action-derived merged state when navigating to a different route", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: data({
              saved: true,
            }) as RouteRuntimeState["actionResult"],
            data: {
              saved: true,
            },
            view: <span id="stale-action-view">Stale action view</span>,
          })}
        >
          <HookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("merged-data")?.getAttribute("data-value")).toContain(
      '"saved":true',
    );

    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={{
            id: "/projects/next",
            params: {},
            search: new URLSearchParams(),
            setSearch() {},
            status: "idle",
            pending: false,
            loaderResult: {
              kind: "data",
              status: 200,
              headers: new Headers(),
              stale: false,
              data: {
                label: "next",
              },
              render() {
                return null;
              },
            },
            actionResult: null,
            data: {
              label: "next",
            },
            view: null,
            error: null,
            async submit() {},
            reload() {},
          }}
        >
          <NextRouteHookProbe />
        </RouteRuntimeProvider>,
      );
      await flushDom();
    });

    expect(document.getElementById("next-loader-result-kind")?.getAttribute("data-value")).toBe(
      "data",
    );
    expect(document.getElementById("next-loader-data")?.getAttribute("data-value")).toContain(
      '"label":"next"',
    );
    expect(document.getElementById("next-loader-error")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("next-action-result-kind")?.getAttribute("data-value")).toBe(
      "null",
    );
    expect(document.getElementById("next-merged-data")?.getAttribute("data-value")).toContain(
      '"label":"next"',
    );
    expect(document.getElementById("next-merged-data")?.getAttribute("data-value")).not.toContain(
      '"saved":true',
    );
    expect(document.getElementById("next-merged-view")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("next-merged-error")?.getAttribute("data-value")).toBe("null");
    expect(document.getElementById("stale-action-view")).toBeNull();
  });
});
