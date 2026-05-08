import { describe, expect, test } from "bun:test";

import {
  getLocationContext,
  getMatchesContext,
  getNavigationContext,
} from "../src/client/contexts";

describe("client context singletons", () => {
  test("reuses the module-local navigation context across repeated access", () => {
    const first = getNavigationContext();
    const second = getNavigationContext();

    expect(first).toBe(second);
    expect("__litzjsNavigationContext" in globalThis).toBe(false);
  });

  test("reuses the module-local location context across repeated access", () => {
    const first = getLocationContext();
    const second = getLocationContext();

    expect(first).toBe(second);
    expect("__litzjsLocationContext" in globalThis).toBe(false);
  });

  test("reuses the module-local matches context across repeated access", () => {
    const first = getMatchesContext();
    const second = getMatchesContext();

    expect(first).toBe(second);
    expect("__litzjsMatchesContext" in globalThis).toBe(false);
  });
});
