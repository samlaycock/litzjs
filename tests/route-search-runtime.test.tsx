import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installClientBindings, resetClientBindings } from "../src/client/bindings";
import { applySearchParams } from "../src/client/navigation";
import {
  RouteRuntimeProvider,
  type RouteRuntimeState,
  createRouteFormComponent,
  useRequiredRouteActions,
  useRequiredRouteData,
  useRequiredRouteLocation,
  useRequiredRouteStatus,
} from "../src/client/route-runtime";
import { defineRoute } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

const route = defineRoute("/projects", {
  component: ProjectsPage,
});

function ProjectsPage() {
  const [searchParams, setSearchParams] = route.useSearch();

  return (
    <main>
      <div id="search-state" data-value={searchParams.toString() || "(empty)"} />
      <button id="merge-search" type="button" onClick={() => setSearchParams({ tab: "active" })}>
        Merge search
      </button>
      <button id="delete-search" type="button" onClick={() => setSearchParams({ tab: null })}>
        Delete search
      </button>
      <button
        id="replace-search"
        type="button"
        onClick={() => setSearchParams({ term: "bun" }, { replace: true })}
      >
        Replace search
      </button>
      <button
        id="noop-search"
        type="button"
        onClick={() => setSearchParams({ term: searchParams.get("term") ?? "" })}
      >
        No-op search
      </button>
    </main>
  );
}

function readSearchEntries(): Array<[string, string]> {
  const value = document.getElementById("search-state")?.getAttribute("data-value");
  const search = value && value !== "(empty)" ? new URLSearchParams(value) : new URLSearchParams();

  return Array.from(search.entries());
}

function readLocation(): URL {
  const value = document.getElementById("location-state")?.getAttribute("data-value");
  return new URL(value ?? "https://example.com/");
}

describe("route search runtime", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    const dom = installTestDom("https://example.com/projects?term=volt");
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

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
        throw new Error("useResourceLoader() is not used in this test.");
      },
      useResourceAction() {
        throw new Error("useResourceAction() is not used in this test.");
      },
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    cleanupDom?.();
    resetClientBindings();
    cleanupDom = null;
    container = null;
    root = null;
  });

  test("route.useSearch() updates URL state with push, replace, delete, and no-op semantics", async () => {
    function SearchHarness() {
      const [location, setLocation] = React.useState(() => window.location.href);
      const navigationLogRef = React.useRef<Array<"push" | "replace">>([]);
      const search = React.useMemo(() => new URL(location).searchParams, [location]);

      const setSearch = React.useCallback<RouteRuntimeState["setSearch"]>(
        (updates, options) => {
          const result = applySearchParams(new URL(location), updates);

          if (!result.changed) {
            return;
          }

          if (options?.replace) {
            navigationLogRef.current.push("replace");
            window.history.replaceState(null, "", result.href);
          } else {
            navigationLogRef.current.push("push");
            window.history.pushState(null, "", result.href);
          }

          setLocation(window.location.href);
        },
        [location],
      );

      const runtime = React.useMemo<RouteRuntimeState>(
        () => ({
          id: "/projects",
          params: {},
          search,
          setSearch,
          status: "idle",
          pending: false,
          loaderResult: null,
          actionResult: null,
          view: null,
          async submit() {
            throw new Error("submit() is not used in this test.");
          },
          reload() {},
          retry() {},
        }),
        [search, setSearch],
      );

      return (
        <RouteRuntimeProvider value={runtime}>
          <div id="location-state" data-value={location} />
          <div id="navigation-log" data-value={navigationLogRef.current.join(",") || "(empty)"} />
          <route.component />
        </RouteRuntimeProvider>
      );
    }

    await act(async () => {
      root?.render(<SearchHarness />);
      await flushDom();
    });

    const mergeButton = document.getElementById("merge-search") as HTMLButtonElement | null;
    const deleteButton = document.getElementById("delete-search") as HTMLButtonElement | null;
    const replaceButton = document.getElementById("replace-search") as HTMLButtonElement | null;
    const noopButton = document.getElementById("noop-search") as HTMLButtonElement | null;

    expect(readSearchEntries()).toEqual([["term", "volt"]]);
    expect(readLocation().pathname).toBe("/projects");
    expect(Array.from(readLocation().searchParams.entries())).toEqual([["term", "volt"]]);
    expect(document.getElementById("navigation-log")?.getAttribute("data-value")).toBe("(empty)");
    expect(window.history.length).toBe(1);

    await act(async () => {
      mergeButton?.click();
      await flushDom();
    });

    expect(readSearchEntries()).toEqual([
      ["term", "volt"],
      ["tab", "active"],
    ]);
    expect(readLocation().pathname).toBe("/projects");
    expect(Array.from(readLocation().searchParams.entries())).toEqual([
      ["term", "volt"],
      ["tab", "active"],
    ]);
    expect(document.getElementById("navigation-log")?.getAttribute("data-value")).toBe("push");
    expect(window.history.length).toBe(2);

    await act(async () => {
      replaceButton?.click();
      await flushDom();
    });

    expect(readSearchEntries()).toEqual([
      ["tab", "active"],
      ["term", "bun"],
    ]);
    expect(readLocation().pathname).toBe("/projects");
    expect(Array.from(readLocation().searchParams.entries())).toEqual([
      ["tab", "active"],
      ["term", "bun"],
    ]);
    expect(document.getElementById("navigation-log")?.getAttribute("data-value")).toBe(
      "push,replace",
    );
    expect(window.history.length).toBe(2);

    await act(async () => {
      deleteButton?.click();
      await flushDom();
    });

    expect(readSearchEntries()).toEqual([["term", "bun"]]);
    expect(readLocation().pathname).toBe("/projects");
    expect(Array.from(readLocation().searchParams.entries())).toEqual([["term", "bun"]]);
    expect(document.getElementById("navigation-log")?.getAttribute("data-value")).toBe(
      "push,replace,push",
    );
    expect(window.history.length).toBe(3);

    await act(async () => {
      noopButton?.click();
      await flushDom();
    });

    expect(readSearchEntries()).toEqual([["term", "bun"]]);
    expect(readLocation().pathname).toBe("/projects");
    expect(Array.from(readLocation().searchParams.entries())).toEqual([["term", "bun"]]);
    expect(document.getElementById("navigation-log")?.getAttribute("data-value")).toBe(
      "push,replace,push",
    );
    expect(window.history.length).toBe(3);
  });
});
