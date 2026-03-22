import { describe, expect, test } from "bun:test";

import { shouldInterceptLinkNavigation, shouldPrefetchLink } from "../src/client/navigation";

describe("client navigation interception", () => {
  test("keeps native hash-only navigation", () => {
    expect(
      shouldInterceptLinkNavigation({
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        currentUrl: new URL("https://example.com/docs"),
        nextUrl: new URL("https://example.com/docs#install"),
      }),
    ).toBe(false);
  });

  test("intercepts same-origin route navigation", () => {
    expect(
      shouldInterceptLinkNavigation({
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        currentUrl: new URL("https://example.com/docs"),
        nextUrl: new URL("https://example.com/docs/getting-started"),
      }),
    ).toBe(true);
  });

  test("prefetches same-origin route links", () => {
    expect(
      shouldPrefetchLink({
        currentUrl: new URL("https://example.com/docs"),
        nextUrl: new URL("https://example.com/docs/getting-started"),
      }),
    ).toBe(true);
  });

  test("does not prefetch downloads or external links", () => {
    expect(
      shouldPrefetchLink({
        download: true,
        currentUrl: new URL("https://example.com/docs"),
        nextUrl: new URL("https://example.com/docs/archive.zip"),
      }),
    ).toBe(false);

    expect(
      shouldPrefetchLink({
        currentUrl: new URL("https://example.com/docs"),
        nextUrl: new URL("https://other.example.com/docs"),
      }),
    ).toBe(false);
  });
});
