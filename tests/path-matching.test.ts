import { describe, expect, test } from "bun:test";

import { extractRouteLikeParams, matchPathname, sortByPathSpecificity } from "../src/path-matching";

describe("path matching", () => {
  test("matches exact route params", () => {
    expect(matchPathname("/users/:id", "/users/42")).toEqual({ id: "42" });
    expect(matchPathname("/users/:id", "/users")).toBeNull();
  });

  test("matches prefix params for layouts", () => {
    expect(extractRouteLikeParams("/teams/:teamId", "/teams/core/settings")).toEqual({
      teamId: "core",
    });
  });

  test("sorts static routes ahead of dynamic routes", () => {
    const sorted = sortByPathSpecificity([
      { path: "/users/:id" },
      { path: "/users/new" },
      { path: "/users/:id/edit" },
      { path: "/" },
    ]);

    expect(sorted.map((entry) => entry.path)).toEqual([
      "/users/:id/edit",
      "/users/new",
      "/users/:id",
      "/",
    ]);
  });
});
