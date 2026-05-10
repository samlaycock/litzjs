import { afterEach, describe, expect, test } from "bun:test";

import {
  configureClientBaseUrl,
  resolveClientHref,
  resolveClientRoutePathname,
  resolveClientTransportPath,
} from "../src/client/base-url";

describe("client base URL helpers", () => {
  afterEach(() => {
    configureClientBaseUrl(undefined);
  });

  test("strips the configured base path from browser route pathnames", () => {
    configureClientBaseUrl("/app/");

    expect(resolveClientRoutePathname("/app/projects/42")).toBe("/projects/42");
    expect(resolveClientRoutePathname("/app")).toBe("/");
    expect(resolveClientRoutePathname("/projects/42")).toBe("/projects/42");
  });

  test("prefixes root-relative app hrefs with the configured base path", () => {
    configureClientBaseUrl("/app/");

    expect(resolveClientHref("/projects/42?tab=activity#details")).toBe(
      "/app/projects/42?tab=activity#details",
    );
    expect(resolveClientHref("/app/projects/42")).toBe("/app/projects/42");
    expect(resolveClientTransportPath("/_litzjs/route")).toBe("/app/_litzjs/route");
  });

  test("preserves non-root-relative hrefs", () => {
    configureClientBaseUrl("/app/");

    expect(resolveClientHref("settings")).toBe("settings");
    expect(resolveClientHref("../settings")).toBe("../settings");
    expect(resolveClientHref("?tab=activity")).toBe("?tab=activity");
    expect(resolveClientHref("#details")).toBe("#details");
    expect(resolveClientHref("https://other.example.com/projects")).toBe(
      "https://other.example.com/projects",
    );
    expect(resolveClientHref("//cdn.example.com/asset.js")).toBe("//cdn.example.com/asset.js");
  });
});
