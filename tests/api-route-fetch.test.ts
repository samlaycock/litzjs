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
});
