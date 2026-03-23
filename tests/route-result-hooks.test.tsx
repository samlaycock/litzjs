import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { RouteRuntimeState } from "../src/client/route-runtime";

import { installClientBindings, resetClientBindings } from "../src/client/bindings";
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

function installRuntimeBindings(): void {
  installClientBindings({
    useRequiredRouteLocation,
    useRequiredRouteStatus,
    useRequiredRouteData,
    useRequiredRouteActions,
    useMatches() {
      return [];
    },
    createRouteFormComponent,
    useResourceLoader() {
      throw new Error("useResourceLoader() is not used in route result hook tests.");
    },
    useResourceAction() {
      throw new Error("useResourceAction() is not used in route result hook tests.");
    },
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
    async submit() {},
    reload() {},
    retry() {},
    ...overrides,
  };
}

function HookProbe(): React.ReactElement {
  const loaderResult = route.useLoaderResult();
  const loaderData = route.useLoaderData();
  const loaderView = route.useLoaderView();
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

  test("surfaces explicit action errors through useActionError() and useError()", async () => {
    await act(async () => {
      root?.render(
        <RouteRuntimeProvider
          value={createRuntimeState({
            actionResult: error(
              422,
              "Project name is invalid",
            ) as RouteRuntimeState["actionResult"],
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
});
