import { describe, expect, test } from "bun:test";

import {
  applySearchParams,
  shouldInterceptLinkNavigation,
  shouldPrefetchLink,
} from "../src/client/navigation";

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

describe("search param navigation", () => {
  test("merges updates into the current query string", () => {
    expect(
      applySearchParams(new URL("https://example.com/docs?term=litz"), {
        tab: "active",
      }),
    ).toEqual({
      changed: true,
      href: "/docs?term=litz&tab=active",
    });
  });

  test("supports repeated keys for array values", () => {
    expect(
      applySearchParams(new URL("https://example.com/docs?term=litz"), {
        tag: ["framework", "bun"],
      }),
    ).toEqual({
      changed: true,
      href: "/docs?term=litz&tag=framework&tag=bun",
    });
  });

  test("deletes keys when passed nullish values", () => {
    expect(
      applySearchParams(new URL("https://example.com/docs?term=litz&tab=active#intro"), {
        tab: null,
      }),
    ).toEqual({
      changed: true,
      href: "/docs?term=litz#intro",
    });
  });

  test("returns unchanged when the resulting query string matches", () => {
    expect(
      applySearchParams(new URL("https://example.com/docs?term=litz"), {
        term: "litz",
      }),
    ).toEqual({
      changed: false,
      href: "/docs?term=litz",
    });
  });
});
