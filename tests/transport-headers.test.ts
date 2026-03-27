import { describe, expect, test, mock } from "bun:test";

import {
  createViewResult,
  getRevalidateTargets,
  parseActionResponse,
  parseLoaderResponse,
} from "../src/client/transport";

void mock.module("@vitejs/plugin-rsc/browser", () => ({
  createFromReadableStream: () => Promise.resolve(null),
}));

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NODE_ENV;
    return;
  }

  process.env.NODE_ENV = value;
}

describe("transport header reading", () => {
  test("createViewResult reads status from x-litzjs-status header", async () => {
    const response = new Response(new ReadableStream(), {
      status: 200,
      headers: {
        "content-type": "text/x-component",
        "x-litzjs-kind": "view",
        "x-litzjs-status": "404",
        "x-litzjs-view-id": "test-view",
      },
    });

    const result = await createViewResult(response);

    expect(result.status).toBe(404);
  });

  test("createViewResult falls back to response.status when header is absent", async () => {
    const response = new Response(new ReadableStream(), {
      status: 201,
      headers: {
        "content-type": "text/x-component",
        "x-litzjs-kind": "view",
        "x-litzjs-view-id": "test-view",
      },
    });

    const result = await createViewResult(response);

    expect(result.status).toBe(201);
  });

  test("getRevalidateTargets reads from x-litzjs-revalidate header", () => {
    const headers = new Headers({
      "x-litzjs-revalidate": "/projects,/dashboard",
    });

    const targets = getRevalidateTargets(headers);

    expect(targets).toEqual(["/projects", "/dashboard"]);
  });

  test("getRevalidateTargets returns empty array when header is absent", () => {
    const headers = new Headers();

    const targets = getRevalidateTargets(headers);

    expect(targets).toEqual([]);
  });

  test("parseLoaderResponse throws framework faults instead of surfacing them as loader errors", async () => {
    const response = Response.json(
      {
        kind: "fault",
        message: "Route not found.",
      },
      { status: 404 },
    );
    const error = await parseLoaderResponse(response).catch((reason) => reason);

    expect(error).toMatchObject({
      kind: "fault",
      status: 404,
      message: "Route not found.",
    });
  });

  test("parseLoaderResponse normalizes non-JSON error responses into development faults", async () => {
    setNodeEnv("development");

    try {
      const response = new Response("<html><body>Bad gateway</body></html>", {
        status: 502,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
      const error = await parseLoaderResponse(response).catch((reason) => reason);

      expect(error).toMatchObject({
        kind: "fault",
        status: 502,
      });
      expect((error as { message: string }).message).toContain("502");
      expect((error as { message: string }).message).toContain("Bad gateway");
    } finally {
      setNodeEnv(originalNodeEnv);
    }
  });

  test("parseActionResponse normalizes malformed JSON into production faults", async () => {
    setNodeEnv("production");

    try {
      const response = new Response('{"kind":"data"', {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
      const result = await parseActionResponse(response);

      expect(result).not.toBeNull();

      if (!result || result.kind !== "fault") {
        throw new Error("Expected a normalized fault result.");
      }

      expect(result.status).toBe(503);
      expect(result.message).toBe("[litzjs] The server returned an invalid response.");
      expect(result.digest).toBeUndefined();
      expect(result.headers.get("content-type")).toBe("application/json; charset=utf-8");
    } finally {
      setNodeEnv(originalNodeEnv);
    }
  });
});
