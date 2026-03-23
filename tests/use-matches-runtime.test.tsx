import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installClientBindings, resetClientBindings } from "../src/client/bindings";
import { createRouteFormComponent } from "../src/client/route-runtime";
import { useMatches, type VoltMatch } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

type MatchesState = {
  pending: boolean;
  matches: VoltMatch[];
};

const MatchesContext = React.createContext<VoltMatch[]>([]);

function installMatchesBindings(): void {
  installClientBindings({
    useRequiredRouteLocation() {
      throw new Error("Route location runtime is not used in useMatches runtime tests.");
    },
    useRequiredRouteStatus() {
      throw new Error("Route status runtime is not used in useMatches runtime tests.");
    },
    useRequiredRouteData() {
      throw new Error("Route data runtime is not used in useMatches runtime tests.");
    },
    useRequiredRouteActions() {
      throw new Error("Route actions runtime is not used in useMatches runtime tests.");
    },
    useMatches() {
      return React.useContext(MatchesContext);
    },
    createRouteFormComponent,
    useResourceLoader() {
      throw new Error("useResourceLoader() is not used in useMatches runtime tests.");
    },
    useResourceAction() {
      throw new Error("useResourceAction() is not used in useMatches runtime tests.");
    },
  });
}

function createMatchesState(pathname: "/projects/123" | "/projects/123/settings"): MatchesState {
  const search = new URLSearchParams("tab=overview");

  if (pathname === "/projects/123/settings") {
    return {
      pending: false,
      matches: [
        {
          id: "/projects",
          path: "/projects",
          params: {},
          search,
        },
        {
          id: "/projects/:id/settings",
          path: "/projects/:id/settings",
          params: {
            id: "123",
          },
          search,
        },
      ],
    };
  }

  return {
    pending: false,
    matches: [
      {
        id: "/projects",
        path: "/projects",
        params: {},
        search,
      },
      {
        id: "/projects/:id",
        path: "/projects/:id",
        params: {
          id: "123",
        },
        search,
      },
    ],
  };
}

describe("useMatches runtime", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    const dom = installTestDom();
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    installMatchesBindings();
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

  test("useMatches() does not rerender on unrelated parent state changes when the match array is unchanged", async () => {
    let setState!: React.Dispatch<React.SetStateAction<MatchesState>>;
    let renderCount = 0;

    const MatchesReader = React.memo(function MatchesReader(): React.ReactElement {
      renderCount += 1;
      const matches = useMatches();

      return (
        <div id="matches-output" data-value={matches.map((match) => match.path).join(" > ")} />
      );
    });

    function Harness(): React.ReactElement {
      const [state, updateState] = React.useState(() => createMatchesState("/projects/123"));
      setState = updateState;

      return (
        <MatchesContext.Provider value={state.matches}>
          <div id="pending-flag" data-value={state.pending ? "pending" : "idle"} />
          <MatchesReader />
        </MatchesContext.Provider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    expect(renderCount).toBe(1);

    await act(async () => {
      setState((current) => ({
        ...current,
        pending: true,
      }));
      await flushDom();
    });

    await act(async () => {
      setState((current) => ({
        ...current,
        pending: false,
      }));
      await flushDom();
    });

    expect(renderCount).toBe(1);
    expect(document.getElementById("matches-output")?.getAttribute("data-value")).toBe(
      "/projects > /projects/:id",
    );
  });

  test("useMatches() rerenders when the matched route chain changes", async () => {
    let setState!: React.Dispatch<React.SetStateAction<MatchesState>>;
    let renderCount = 0;

    const MatchesReader = React.memo(function MatchesReader(): React.ReactElement {
      renderCount += 1;
      const matches = useMatches();

      return (
        <div id="matches-output" data-value={matches.map((match) => match.path).join(" > ")} />
      );
    });

    function Harness(): React.ReactElement {
      const [state, updateState] = React.useState(() => createMatchesState("/projects/123"));
      setState = updateState;

      return (
        <MatchesContext.Provider value={state.matches}>
          <MatchesReader />
        </MatchesContext.Provider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    expect(renderCount).toBe(1);

    await act(async () => {
      setState(createMatchesState("/projects/123/settings"));
      await flushDom();
    });

    expect(renderCount).toBe(2);
    expect(document.getElementById("matches-output")?.getAttribute("data-value")).toBe(
      "/projects > /projects/:id/settings",
    );
  });
});
