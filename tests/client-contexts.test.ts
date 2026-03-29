import { afterEach, describe, expect, test } from "bun:test";

import {
  getLocationContext,
  getMatchesContext,
  getNavigationContext,
} from "../src/client/contexts";

describe("client context singletons", () => {
  afterEach(() => {
    delete globalThis.__litzjsNavigationContext;
    delete globalThis.__litzjsLocationContext;
    delete globalThis.__litzjsMatchesContext;
  });

  test("reuses the global navigation context across repeated access", () => {
    const first = getNavigationContext();
    const second = getNavigationContext();

    expect(first).toBe(second);
    expect(globalThis.__litzjsNavigationContext).toBe(first);
  });

  test("reuses the global location context across repeated access", () => {
    const first = getLocationContext();
    const second = getLocationContext();

    expect(first).toBe(second);
    expect(globalThis.__litzjsLocationContext).toBe(first);
  });

  test("reuses the global matches context across repeated access", () => {
    const first = getMatchesContext();
    const second = getMatchesContext();

    expect(first).toBe(second);
    expect(globalThis.__litzjsMatchesContext).toBe(first);
  });
});
