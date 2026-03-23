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
import { defineRoute } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

const testRoute = defineRoute("/projects/:id", {
  component() {
    return null;
  },
});

const viewRoute = defineRoute("/projects/:id", {
  component() {
    return null;
  },
  async loader() {
    return {
      kind: "view" as const,
      node: null,
    };
  },
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
      throw new Error("Resource location runtime is not used in route runtime rerender tests.");
    },
    useRequiredResourceStatus() {
      throw new Error("Resource status runtime is not used in route runtime rerender tests.");
    },
    useRequiredResourceData() {
      throw new Error("Resource data runtime is not used in route runtime rerender tests.");
    },
    useRequiredResourceActions() {
      throw new Error("Resource actions runtime is not used in route runtime rerender tests.");
    },
    useMatches: () => [],
    createRouteFormComponent,
    createResourceFormComponent,
    createResourceComponent,
  });
}

function createRuntimeState(): RouteRuntimeState {
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
    async submit() {},
    reload() {},
    retry() {},
  };
}

describe("route runtime rerendering", () => {
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

  test("route.useParams() does not rerender on pending-only submit state changes", async () => {
    let setRuntimeState!: React.Dispatch<React.SetStateAction<RouteRuntimeState>>;
    let renderCount = 0;

    const ParamsReader = React.memo(function ParamsReader(): React.ReactElement {
      renderCount += 1;
      const params = testRoute.useParams();
      return <div id="params-output" data-value={params.id} />;
    });

    function Harness(): React.ReactElement {
      const [runtimeState, setRuntime] = React.useState(() => createRuntimeState());
      setRuntimeState = setRuntime;
      return (
        <RouteRuntimeProvider value={runtimeState}>
          <ParamsReader />
        </RouteRuntimeProvider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    expect(renderCount).toBe(1);

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "submitting",
        pending: true,
      }));
      await flushDom();
    });

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "idle",
        pending: false,
        actionResult: {
          kind: "data",
          status: 200,
          headers: new Headers(),
          data: "saved",
        },
      }));
      await flushDom();
    });

    expect(renderCount).toBe(1);
    expect(document.getElementById("params-output")?.getAttribute("data-value")).toBe("123");
  });

  test("route.useSearch() does not rerender when submit or revalidation leaves the URL unchanged", async () => {
    let setRuntimeState!: React.Dispatch<React.SetStateAction<RouteRuntimeState>>;
    let renderCount = 0;

    const SearchReader = React.memo(function SearchReader(): React.ReactElement {
      renderCount += 1;
      const [search] = testRoute.useSearch();
      return <div id="search-output" data-value={search.get("tab") ?? "none"} />;
    });

    function Harness(): React.ReactElement {
      const [runtimeState, setRuntime] = React.useState(() => createRuntimeState());
      setRuntimeState = setRuntime;
      return (
        <RouteRuntimeProvider value={runtimeState}>
          <SearchReader />
        </RouteRuntimeProvider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    expect(renderCount).toBe(1);

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "submitting",
        pending: true,
      }));
      await flushDom();
    });

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "revalidating",
        pending: true,
        loaderResult: {
          kind: "view",
          status: 200,
          headers: new Headers(),
          stale: false,
          node: <span>Reloaded</span>,
          render() {
            return <span>Reloaded</span>;
          },
        },
        view: <span>Reloaded</span>,
      }));
      await flushDom();
    });

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "idle",
        pending: false,
      }));
      await flushDom();
    });

    expect(renderCount).toBe(1);
    expect(document.getElementById("search-output")?.getAttribute("data-value")).toBe("overview");
  });

  test("route.usePending() rerenders when pending changes", async () => {
    let setRuntimeState!: React.Dispatch<React.SetStateAction<RouteRuntimeState>>;
    let renderCount = 0;

    const PendingReader = React.memo(function PendingReader(): React.ReactElement {
      renderCount += 1;
      const pending = testRoute.usePending();
      return <div id="pending-output" data-value={pending ? "pending" : "idle"} />;
    });

    function Harness(): React.ReactElement {
      const [runtimeState, setRuntime] = React.useState(() => createRuntimeState());
      setRuntimeState = setRuntime;
      return (
        <RouteRuntimeProvider value={runtimeState}>
          <PendingReader />
        </RouteRuntimeProvider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    expect(renderCount).toBe(1);

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "submitting",
        pending: true,
      }));
      await flushDom();
    });

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "idle",
        pending: false,
      }));
      await flushDom();
    });

    expect(renderCount).toBe(3);
    expect(document.getElementById("pending-output")?.getAttribute("data-value")).toBe("idle");
  });

  test("route.useView() rerenders on view updates but not pending-only changes", async () => {
    let setRuntimeState!: React.Dispatch<React.SetStateAction<RouteRuntimeState>>;
    let renderCount = 0;

    const ViewReader = React.memo(function ViewReader(): React.ReactElement {
      renderCount += 1;
      const view = viewRoute.useView();
      return (
        <div id="view-output" data-value={view ? "present" : "empty"}>
          {view}
        </div>
      );
    });

    function Harness(): React.ReactElement {
      const [runtimeState, setRuntime] = React.useState(() => createRuntimeState());
      setRuntimeState = setRuntime;
      return (
        <RouteRuntimeProvider value={runtimeState}>
          <ViewReader />
        </RouteRuntimeProvider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    expect(renderCount).toBe(1);

    await act(async () => {
      setRuntimeState((current) => ({
        ...current,
        status: "loading",
        pending: true,
      }));
      await flushDom();
    });

    expect(renderCount).toBe(1);

    await act(async () => {
      setRuntimeState((current) => {
        const view = <span id="loaded-view">Loaded view</span>;

        return {
          ...current,
          status: "idle",
          pending: false,
          loaderResult: {
            kind: "view",
            status: 200,
            headers: new Headers(),
            stale: false,
            node: view,
            render() {
              return view;
            },
          },
          view,
        };
      });
      await flushDom();
    });

    expect(renderCount).toBe(2);
    expect(document.getElementById("view-output")?.getAttribute("data-value")).toBe("present");
    expect(document.getElementById("loaded-view")?.textContent).toBe("Loaded view");
  });
});
