import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installClientBindings, resetClientBindings } from "../src/client/bindings";
import { createResourceComponent, createResourceFormComponent } from "../src/client/resources";
import { createRouteFormComponent } from "../src/client/route-runtime";
import { useLocation, usePathname, type VoltLocation } from "../src/index";
import { flushDom, installTestDom } from "./test-dom";

const LocationContext = React.createContext<VoltLocation>({
  href: "https://example.com/",
  pathname: "/",
  search: new URLSearchParams(),
  hash: "",
});

function installLocationBindings(): void {
  installClientBindings({
    usePathname() {
      return React.useContext(LocationContext).pathname;
    },
    useLocation() {
      return React.useContext(LocationContext);
    },
    useRequiredRouteLocation() {
      throw new Error("Route location runtime is not used in location hook tests.");
    },
    useRequiredRouteStatus() {
      throw new Error("Route status runtime is not used in location hook tests.");
    },
    useRequiredRouteData() {
      throw new Error("Route data runtime is not used in location hook tests.");
    },
    useRequiredRouteActions() {
      throw new Error("Route actions runtime is not used in location hook tests.");
    },
    useRequiredResourceLocation() {
      throw new Error("Resource location runtime is not used in location hook tests.");
    },
    useRequiredResourceStatus() {
      throw new Error("Resource status runtime is not used in location hook tests.");
    },
    useRequiredResourceData() {
      throw new Error("Resource data runtime is not used in location hook tests.");
    },
    useRequiredResourceActions() {
      throw new Error("Resource actions runtime is not used in location hook tests.");
    },
    useMatches() {
      return [];
    },
    createRouteFormComponent,
    createResourceFormComponent,
    createResourceComponent,
  });
}

function LocationProbe(): React.ReactElement {
  const pathname = usePathname();
  const location = useLocation();

  return (
    <div
      id="location-output"
      data-pathname={pathname}
      data-href={location.href}
      data-search={location.search.toString()}
      data-hash={location.hash}
    />
  );
}

describe("location hooks", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    const dom = installTestDom();
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    installLocationBindings();
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

  test("usePathname() and useLocation() expose the current client location state", async () => {
    function Harness(): React.ReactElement {
      const [location, setLocation] = React.useState<VoltLocation>({
        href: "https://example.com/projects/123?tab=overview#summary",
        pathname: "/projects/123",
        search: new URLSearchParams("tab=overview"),
        hash: "#summary",
      });

      return (
        <LocationContext.Provider value={location}>
          <button
            id="update-location"
            type="button"
            onClick={() =>
              setLocation({
                href: "https://example.com/projects/123/settings?tab=activity#panel",
                pathname: "/projects/123/settings",
                search: new URLSearchParams("tab=activity"),
                hash: "#panel",
              })
            }
          >
            Update
          </button>
          <LocationProbe />
        </LocationContext.Provider>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
      await flushDom();
    });

    const output = document.getElementById("location-output");
    expect(output?.getAttribute("data-pathname")).toBe("/projects/123");
    expect(output?.getAttribute("data-href")).toBe(
      "https://example.com/projects/123?tab=overview#summary",
    );
    expect(output?.getAttribute("data-search")).toBe("tab=overview");
    expect(output?.getAttribute("data-hash")).toBe("#summary");

    await act(async () => {
      (document.getElementById("update-location") as HTMLButtonElement | null)?.click();
      await flushDom();
    });

    expect(output?.getAttribute("data-pathname")).toBe("/projects/123/settings");
    expect(output?.getAttribute("data-href")).toBe(
      "https://example.com/projects/123/settings?tab=activity#panel",
    );
    expect(output?.getAttribute("data-search")).toBe("tab=activity");
    expect(output?.getAttribute("data-hash")).toBe("#panel");
  });
});
