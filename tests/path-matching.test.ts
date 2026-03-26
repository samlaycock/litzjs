import { describe, expect, test } from "bun:test";

import {
  extractRouteLikeParams,
  hasPatternSegments,
  matchPathname,
  matchPrefixPathname,
  sortByPathSpecificity,
} from "../src/path-matching";

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

  test("detects parameterized and wildcard path patterns", () => {
    expect(hasPatternSegments("/users/:id")).toBe(true);
    expect(hasPatternSegments("/docs/*slug")).toBe(true);
    expect(hasPatternSegments("/docs/getting-started")).toBe(false);
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

  describe("wildcard routes", () => {
    test("matches named wildcard and captures remaining segments", () => {
      expect(matchPathname("/docs/*slug", "/docs/getting-started/installation")).toEqual({
        slug: "getting-started/installation",
      });
    });

    test("matches named wildcard with a single remaining segment", () => {
      expect(matchPathname("/docs/*slug", "/docs/intro")).toEqual({
        slug: "intro",
      });
    });

    test("matches named wildcard with no remaining segments", () => {
      expect(matchPathname("/docs/*slug", "/docs")).toEqual({
        slug: "",
      });
    });

    test("matches unnamed wildcard without capturing a param", () => {
      expect(matchPathname("/admin/*", "/admin/users/settings")).toEqual({});
    });

    test("matches wildcard combined with dynamic segments", () => {
      expect(matchPathname("/files/:owner/*path", "/files/sam/a/b/c")).toEqual({
        owner: "sam",
        path: "a/b/c",
      });
    });

    test("does not match wildcard when static prefix does not match", () => {
      expect(matchPathname("/docs/*slug", "/blog/getting-started")).toBeNull();
    });

    test("decodes URI components in wildcard captures", () => {
      expect(matchPathname("/files/*path", "/files/my%20folder/file%20name")).toEqual({
        path: "my folder/file name",
      });
    });

    test("prefix matching delegates to matchPathname for wildcard routes", () => {
      expect(matchPrefixPathname("/docs/*slug", "/docs/a/b")).toEqual({
        slug: "a/b",
      });
    });

    test("sorts wildcard routes below static and dynamic routes", () => {
      const sorted = sortByPathSpecificity([
        { path: "/docs/*slug" },
        { path: "/docs/:id" },
        { path: "/docs/intro" },
        { path: "/*catch" },
      ]);

      expect(sorted.map((entry) => entry.path)).toEqual([
        "/docs/intro",
        "/docs/:id",
        "/docs/*slug",
        "/*catch",
      ]);
    });

    test("sorts wildcard routes with more static segments before fewer", () => {
      const sorted = sortByPathSpecificity([{ path: "/*catch" }, { path: "/admin/*rest" }]);

      expect(sorted.map((entry) => entry.path)).toEqual(["/admin/*rest", "/*catch"]);
    });
  });
});
