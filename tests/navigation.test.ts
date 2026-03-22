import { describe, expect, test } from "bun:test";

import { shouldInterceptLinkNavigation } from "../src/client/navigation";

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
});
