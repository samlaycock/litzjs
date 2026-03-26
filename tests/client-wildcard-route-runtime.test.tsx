import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { act } from "react";

import { flushDom, installTestDom } from "./test-dom";

type ClientModule = typeof import("../src/client/index");

let clientModule: ClientModule | null = null;
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

function HomeRoute(): React.ReactElement {
  if (!clientModule) {
    throw new Error("Client runtime has not been loaded.");
  }

  const Link = clientModule.Link;

  return (
    <main>
      <div id="route-state" data-value="home-route" />
      <Link href="/docs/getting-started/install">Open docs wildcard route</Link>
    </main>
  );
}

function DocsRoute(): React.ReactElement {
  return <div id="route-state" data-value="wildcard-route" />;
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

  beforeEach(() => {
    const dom = installTestDom("https://example.com/");
    cleanupDom = () => dom.cleanup();
    container = document.createElement("div");
    document.body.appendChild(container);
    clientModule = null;
    loadHomeRoute.mockClear();
    loadDocsRoute.mockClear();
  });

  afterEach(() => {
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
});
