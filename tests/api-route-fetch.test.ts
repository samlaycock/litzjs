import { afterEach, describe, expect, test } from "bun:test";

import { defineApiRoute } from "../src/index";

describe("defineApiRoute().fetch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("preserves repeated query params from object search input", async () => {
    let capturedInput: RequestInfo | URL | undefined;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedInput = input;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const api = defineApiRoute("/api/projects", {
      GET() {
        return new Response(null, { status: 204 });
      },
    });

    await api.fetch({
      search: {
        tag: ["framework", "bun"],
        term: "litz",
      },
    });

    expect(capturedInput).toBe("/api/projects?tag=framework&tag=bun&term=litz");
  });

  test("supports an explicit baseUrl for server-side and test callers", async () => {
    let capturedInput: RequestInfo | URL | undefined;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedInput = input;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const api = defineApiRoute("/api/projects/:id", {
      GET() {
        return new Response(null, { status: 204 });
      },
    });

    await api.fetch({
      baseUrl: "https://example.com/root/",
      params: { id: "42" },
      search: { tab: "details" },
    });

    expect(capturedInput).toBe("https://example.com/root/api/projects/42?tab=details");
  });

  test("preserves baseUrl path prefixes when resolving API requests", async () => {
    let capturedInput: RequestInfo | URL | undefined;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedInput = input;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const api = defineApiRoute("/api/projects/:id", {
      GET() {
        return new Response(null, { status: 204 });
      },
    });

    await api.fetch({
      baseUrl: "https://example.com/root",
      params: { id: "42" },
    });

    expect(capturedInput).toBe("https://example.com/root/api/projects/42");
  });
});
