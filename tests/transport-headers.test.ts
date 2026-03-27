import { describe, expect, test, mock } from "bun:test";

import {
  createViewResult,
  getRevalidateTargets,
  parseLoaderResponse,
} from "../src/client/transport";

void mock.module("@vitejs/plugin-rsc/browser", () => ({
  createFromReadableStream: () => Promise.resolve(null),
}));

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

    await expect(parseLoaderResponse(response)).rejects.toMatchObject({
      kind: "fault",
      status: 404,
      message: "Route not found.",
    });
  });
});
