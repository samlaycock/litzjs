import { describe, expect, test } from "bun:test";

import { data, defineApiRoute, defineApp, defineResource, defineRoute, server } from "../src";
import { createServer } from "../src/server";
import { createInternalActionRequestInit } from "../src/server/internal-requests";

describe("explicit app registration", () => {
  test("createServer dispatches routes, resources, and API routes from a Litz app", async () => {
    const route = defineRoute("/projects/:id", {
      component() {
        return null;
      },
      loader: server(({ params }) => data({ id: params.id })),
    });
    const resource = defineResource("/resources/account", {
      component() {
        return null;
      },
      loader: server(() => data({ name: "Ada" })),
    });
    const api = defineApiRoute("/api/health", {
      GET() {
        return Response.json({ ok: true });
      },
    });
    const app = defineApp({
      routes: [route],
      resources: [resource],
      apiRoutes: [api],
    });
    const litzServer = createServer({
      app,
      document: "Document",
    });

    const documentResponse = await litzServer.fetch(
      new Request("https://example.com/projects/123", {
        headers: { accept: "text/html" },
      }),
    );
    const routeRequest = createInternalActionRequestInit({
      path: "/projects/:id",
      operation: "loader",
      request: {
        params: { id: "123" },
      },
    });
    const routeResponse = await litzServer.fetch(
      new Request("https://example.com/_litzjs/route", {
        body: routeRequest.body,
        headers: routeRequest.headers,
        method: "POST",
      }),
    );
    const resourceRequest = createInternalActionRequestInit({
      path: "/resources/account",
      operation: "loader",
    });
    const resourceResponse = await litzServer.fetch(
      new Request("https://example.com/_litzjs/resource", {
        body: resourceRequest.body,
        headers: resourceRequest.headers,
        method: "POST",
      }),
    );
    const apiResponse = await litzServer.fetch(new Request("https://example.com/api/health"));

    expect(documentResponse.status).toBe(200);
    expect(await documentResponse.text()).toBe("Document");
    expect(routeResponse.status).toBe(200);
    expect(await routeResponse.json()).toMatchObject({
      data: { id: "123" },
      kind: "data",
    });
    expect(resourceResponse.status).toBe(200);
    expect(await resourceResponse.json()).toMatchObject({
      data: { name: "Ada" },
      kind: "data",
    });
    expect(apiResponse.status).toBe(200);
    expect(await apiResponse.json()).toEqual({ ok: true });
  });

  test("defineApp rejects duplicate registrations by path", () => {
    const first = defineRoute("/duplicate", {
      component() {
        return null;
      },
    });
    const second = defineRoute("/duplicate", {
      component() {
        return null;
      },
    });

    expect(() => defineApp({ routes: [first, second] })).toThrow(
      'Duplicate route registration for path "/duplicate"',
    );
  });
});
