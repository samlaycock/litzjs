import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createLinkComponent } from "../src/client/link";
import { shouldPrefetchLink } from "../src/client/navigation";
import { flushDom, installTestDom } from "./test-dom";

const NavigationContext = React.createContext<{
  navigate(href: string, options?: { replace?: boolean }): void;
} | null>(null);

describe("link runtime", () => {
  let cleanupDom: (() => void) | null = null;
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    const dom = installTestDom("https://example.com/current");
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    cleanupDom?.();
    cleanupDom = null;
    container = null;
    root = null;
  });

  test("prefetch intent warms same-origin routes without navigating", async () => {
    const prefetchCalls: string[] = [];

    function App() {
      const RuntimeLink = React.useMemo(
        () =>
          createLinkComponent({
            useNavigate() {
              return () => {
                throw new Error("Intent prefetch should not navigate.");
              };
            },
            prefetchRouteForHref(href, options) {
              const currentUrl = new URL(window.location.href);
              const nextUrl = new URL(href, currentUrl);

              if (
                shouldPrefetchLink({
                  target: options?.target,
                  download: options?.download,
                  currentUrl,
                  nextUrl,
                })
              ) {
                prefetchCalls.push(href);
              }
            },
          }),
        [],
      );

      return <RuntimeLink href="/next">Open next route</RuntimeLink>;
    }

    await act(async () => {
      root?.render(<App />);
      await flushDom();
    });

    const link = container?.getElementsByTagName("a")[0] ?? null;

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      link?.dispatchEvent(new Event("focusin", { bubbles: true }));
      link?.dispatchEvent(new Event("touchstart", { bubbles: true }));
      await flushDom();
    });

    expect(prefetchCalls).toEqual(["/next", "/next", "/next"]);
    expect(window.location.href).toBe("https://example.com/current");
  });

  test("external links do not prefetch or navigate through the client runtime", async () => {
    function App() {
      const [prefetchCalls, setPrefetchCalls] = React.useState<string[]>([]);
      const RuntimeLink = React.useMemo(
        () =>
          createLinkComponent({
            useNavigate() {
              const context = React.useContext(NavigationContext);

              if (!context) {
                throw new Error("Test navigation context is missing.");
              }

              return (href, options) => context.navigate(href, options);
            },
            prefetchRouteForHref(href, options) {
              const currentUrl = new URL(window.location.href);
              const nextUrl = new URL(href, currentUrl);

              if (
                !shouldPrefetchLink({
                  target: options?.target,
                  download: options?.download,
                  currentUrl,
                  nextUrl,
                })
              ) {
                return;
              }

              setPrefetchCalls((current) => [...current, href]);
            },
          }),
        [],
      );
      const navigationValue = React.useMemo(
        () => ({
          navigate() {
            throw new Error("External links should not use client navigation.");
          },
        }),
        [],
      );

      return (
        <NavigationContext.Provider value={navigationValue}>
          <div id="prefetch-state" data-value={prefetchCalls.join(",") || "(empty)"} />
          <RuntimeLink
            href="https://other.example.com/next"
            onClick={(event) => event.preventDefault()}
          >
            Open external route
          </RuntimeLink>
        </NavigationContext.Provider>
      );
    }

    await act(async () => {
      root?.render(<App />);
      await flushDom();
    });

    const link = container?.getElementsByTagName("a")[0] ?? null;

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      await flushDom();
    });

    expect(document.getElementById("prefetch-state")?.getAttribute("data-value")).toBe("(empty)");
    expect(window.location.href).toBe("https://example.com/current");
  });

  test("render prefetch warms the route on mount without repeating on intent events", async () => {
    function App() {
      const [prefetchCalls, setPrefetchCalls] = React.useState<string[]>([]);
      const RuntimeLink = React.useMemo(
        () =>
          createLinkComponent({
            useNavigate() {
              const context = React.useContext(NavigationContext);

              if (!context) {
                throw new Error("Test navigation context is missing.");
              }

              return (href, options) => context.navigate(href, options);
            },
            prefetchRouteForHref(href, options) {
              const currentUrl = new URL(window.location.href);
              const nextUrl = new URL(href, currentUrl);

              if (
                !shouldPrefetchLink({
                  target: options?.target,
                  download: options?.download,
                  currentUrl,
                  nextUrl,
                })
              ) {
                return;
              }

              setPrefetchCalls((current) => [...current, `${href}:${options?.includeData}`]);
            },
          }),
        [],
      );
      const navigationValue = React.useMemo(
        () => ({
          navigate() {
            throw new Error("Render prefetch should not navigate.");
          },
        }),
        [],
      );

      return (
        <NavigationContext.Provider value={navigationValue}>
          <div id="prefetch-state" data-value={prefetchCalls.join(",") || "(empty)"} />
          <RuntimeLink href="/next" prefetch="render" prefetchData>
            Open next route
          </RuntimeLink>
        </NavigationContext.Provider>
      );
    }

    await act(async () => {
      root?.render(<App />);
      await flushDom();
    });

    const link = container?.getElementsByTagName("a")[0] ?? null;

    expect(document.getElementById("prefetch-state")?.getAttribute("data-value")).toBe(
      "/next:true",
    );

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      link?.dispatchEvent(new Event("focusin", { bubbles: true }));
      link?.dispatchEvent(new Event("touchstart", { bubbles: true }));
      await flushDom();
    });

    expect(document.getElementById("prefetch-state")?.getAttribute("data-value")).toBe(
      "/next:true",
    );
  });

  test("render prefetch aborts in-flight work when the link unmounts", async () => {
    const receivedSignals: AbortSignal[] = [];

    function App() {
      const [visible, setVisible] = React.useState(true);
      const RuntimeLink = React.useMemo(
        () =>
          createLinkComponent({
            useNavigate() {
              const context = React.useContext(NavigationContext);

              if (!context) {
                throw new Error("Test navigation context is missing.");
              }

              return (href, options) => context.navigate(href, options);
            },
            prefetchRouteForHref(_href, options) {
              if (options?.signal) {
                receivedSignals.push(options.signal);
              }
            },
          }),
        [],
      );
      const navigationValue = React.useMemo(
        () => ({
          navigate() {
            throw new Error("Render prefetch should not navigate.");
          },
        }),
        [],
      );

      return (
        <NavigationContext.Provider value={navigationValue}>
          <button id="toggle-link" onClick={() => setVisible(false)} type="button">
            Hide link
          </button>
          {visible ? (
            <RuntimeLink href="/next" prefetch="render" prefetchData>
              Open next route
            </RuntimeLink>
          ) : null}
        </NavigationContext.Provider>
      );
    }

    await act(async () => {
      root?.render(<App />);
      await flushDom();
    });

    expect(receivedSignals).toHaveLength(1);
    expect(receivedSignals[0]?.aborted).toBe(false);

    await act(async () => {
      (document.getElementById("toggle-link") as HTMLButtonElement | null)?.click();
      await flushDom();
    });

    expect(receivedSignals[0]?.aborted).toBe(true);
  });

  test("prefetch none skips route warming until click", async () => {
    function App() {
      const [location, setLocation] = React.useState(() => window.location.href);
      const [prefetchCalls, setPrefetchCalls] = React.useState<string[]>([]);
      const RuntimeLink = React.useMemo(
        () =>
          createLinkComponent({
            useNavigate() {
              const context = React.useContext(NavigationContext);

              if (!context) {
                throw new Error("Test navigation context is missing.");
              }

              return (href, options) => context.navigate(href, options);
            },
            prefetchRouteForHref(href) {
              setPrefetchCalls((current) => [...current, href]);
            },
          }),
        [],
      );
      const navigationValue = React.useMemo(
        () => ({
          navigate(href: string, options?: { replace?: boolean }) {
            if (options?.replace) {
              window.history.replaceState(null, "", href);
            } else {
              window.history.pushState(null, "", href);
            }

            setLocation(window.location.href);
          },
        }),
        [],
      );

      return (
        <NavigationContext.Provider value={navigationValue}>
          <div id="location-state" data-value={location} />
          <div id="prefetch-state" data-value={prefetchCalls.join(",") || "(empty)"} />
          <RuntimeLink href="/next" prefetch="none">
            Open next route
          </RuntimeLink>
        </NavigationContext.Provider>
      );
    }

    await act(async () => {
      root?.render(<App />);
      await flushDom();
    });

    const link = container?.getElementsByTagName("a")[0] ?? null;

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      link?.dispatchEvent(new Event("focusin", { bubbles: true }));
      link?.dispatchEvent(new Event("touchstart", { bubbles: true }));
      await flushDom();
    });

    expect(document.getElementById("prefetch-state")?.getAttribute("data-value")).toBe("(empty)");

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      await flushDom();
    });

    expect(document.getElementById("location-state")?.getAttribute("data-value")).toBe(
      "https://example.com/next",
    );
    expect(document.getElementById("prefetch-state")?.getAttribute("data-value")).toBe("(empty)");
  });
});
