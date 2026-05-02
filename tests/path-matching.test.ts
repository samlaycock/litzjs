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

  test("treats trailing slashes as significant (URLPattern behavior)", () => {
    expect(matchPathname("/users/:id", "/users/42/")).toBeNull();
    expect(matchPathname("/users/:id/", "/users/42/")).toEqual({ id: "42" });
  });

  test("returns raw captures without decoding (URLPattern behavior)", () => {
    expect(matchPathname("/files/:name", "/files/my%20file")).toEqual({ name: "my%20file" });
  });

  test("does not reject malformed percent-encoding (URLPattern behavior)", () => {
    expect(matchPathname("/users/:id", "/users/%E0%A4%A")).toEqual({ id: "%E0%A4%A" });
  });

  test("matches prefix params for layouts", () => {
    expect(extractRouteLikeParams("/teams/:teamId", "/teams/core/settings")).toEqual({
      teamId: "core",
    });
  });

  test("detects parameterized path patterns", () => {
    expect(hasPatternSegments("/users/:id")).toBe(true);
    expect(hasPatternSegments("/docs/:slug*")).toBe(true);
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

  describe("URLPattern wildcard syntax", () => {
    test("matches named repeat group and captures remaining segments", () => {
      expect(matchPathname("/docs/:slug*", "/docs/getting-started/installation")).toEqual({
        slug: "getting-started/installation",
      });
    });

    test("matches named repeat group with a single remaining segment", () => {
      expect(matchPathname("/docs/:slug*", "/docs/intro")).toEqual({
        slug: "intro",
      });
    });

    test("matches named repeat group with no remaining segments", () => {
      expect(matchPathname("/docs/:slug*", "/docs")).toEqual({});
    });

    test("does not match repeat group when static prefix does not match", () => {
      expect(matchPathname("/docs/:slug*", "/blog/getting-started")).toBeNull();
    });

    test("prefix matching delegates to matchPathname for repeat group routes", () => {
      expect(matchPrefixPathname("/docs/:slug*", "/docs/a/b")).toEqual({
        slug: "a/b",
      });
    });

    test("sorts repeat group routes below static and dynamic routes", () => {
      const sorted = sortByPathSpecificity([
        { path: "/docs/:slug*" },
        { path: "/docs/:id" },
        { path: "/docs/intro" },
        { path: "/:catch*" },
      ]);

      expect(sorted.map((entry) => entry.path)).toEqual([
        "/docs/intro",
        "/docs/:id",
        "/docs/:slug*",
        "/:catch*",
      ]);
    });

    test("sorts repeat group routes with more static segments before fewer", () => {
      const sorted = sortByPathSpecificity([{ path: "/:catch*" }, { path: "/admin/:rest*" }]);

      expect(sorted.map((entry) => entry.path)).toEqual(["/admin/:rest*", "/:catch*"]);
    });
  });

  describe("URLPattern optional groups", () => {
    test("matches optional group when present", () => {
      expect(matchPathname("/users/:id?", "/users/42")).toEqual({ id: "42" });
    });

    test("matches optional group when absent", () => {
      expect(matchPathname("/users/:id?", "/users")).toEqual({});
    });
  });

  describe("URLPattern regex groups", () => {
    test("matches regex-constrained group", () => {
      expect(matchPathname("/users/:id(\\d+)", "/users/42")).toEqual({ id: "42" });
    });

    test("does not match when regex constraint fails", () => {
      expect(matchPathname("/users/:id(\\d+)", "/users/abc")).toBeNull();
    });
  });
});
