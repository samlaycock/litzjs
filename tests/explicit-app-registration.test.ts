import { describe, expect, test } from "bun:test";

import { data, defineApiRoute, defineApp, defineResource, defineRoute, server } from "../src";
import { __withLitzRuntimeOptions, createServer } from "../src/server";
import { createInternalActionRequestInit } from "../src/server/internal-requests";

const bigintSerializer = {
  stringify(value: unknown): string {
    return JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === "bigint"
        ? { __litzjsTestBigInt: nestedValue.toString() }
        : nestedValue,
    );
  },
  parse(text: string): unknown {
    return JSON.parse(text, (_key, nestedValue) => {
      if (
        nestedValue &&
        typeof nestedValue === "object" &&
        "__litzjsTestBigInt" in nestedValue &&
        typeof nestedValue.__litzjsTestBigInt === "string"
      ) {
        return BigInt(nestedValue.__litzjsTestBigInt);
      }

      return nestedValue;
    }) as unknown;
  },
};

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

  test("custom data serializer round-trips route loader and action data", async () => {
    const route = defineRoute("/counter", {
      component() {
        return null;
      },
      loader: server(() => data({ count: 9007199254740993n })),
      action: server(() => data({ count: 9007199254740995n })),
    });
    const app = defineApp({
      dataSerializer: bigintSerializer,
      routes: [route],
    });
    const litzServer = createServer({ app });

    const loaderRequest = createInternalActionRequestInit({
      path: "/counter",
      operation: "loader",
    });
    const loaderResponse = await litzServer.fetch(
      new Request("https://example.com/_litzjs/route", {
        body: loaderRequest.body,
        headers: loaderRequest.headers,
        method: "POST",
      }),
    );
    const actionRequest = createInternalActionRequestInit({
      path: "/counter",
      operation: "action",
    });
    const actionResponse = await litzServer.fetch(
      new Request("https://example.com/_litzjs/action", {
        body: actionRequest.body,
        headers: actionRequest.headers,
        method: "POST",
      }),
    );

    expect(bigintSerializer.parse(await loaderResponse.text())).toEqual({
      kind: "data",
      data: { count: 9007199254740993n },
      revalidate: [],
    });
    expect(bigintSerializer.parse(await actionResponse.text())).toEqual({
      kind: "data",
      data: { count: 9007199254740995n },
      revalidate: [],
    });
  });

  test("custom data serializer round-trips resource loader and action data", async () => {
    const resource = defineResource("/resources/counter", {
      component() {
        return null;
      },
      loader: server(() => data({ count: 9007199254740997n })),
      action: server(() => data({ count: 9007199254740999n })),
    });
    const app = defineApp({
      dataSerializer: bigintSerializer,
      resources: [resource],
    });
    const litzServer = createServer({ app });

    const loaderRequest = createInternalActionRequestInit({
      path: "/resources/counter",
      operation: "loader",
    });
    const loaderResponse = await litzServer.fetch(
      new Request("https://example.com/_litzjs/resource", {
        body: loaderRequest.body,
        headers: loaderRequest.headers,
        method: "POST",
      }),
    );
    const actionRequest = createInternalActionRequestInit({
      path: "/resources/counter",
      operation: "action",
    });
    const actionResponse = await litzServer.fetch(
      new Request("https://example.com/_litzjs/resource", {
        body: actionRequest.body,
        headers: actionRequest.headers,
        method: "POST",
      }),
    );

    expect(bigintSerializer.parse(await loaderResponse.text())).toEqual({
      kind: "data",
      data: { count: 9007199254740997n },
      revalidate: [],
    });
    expect(bigintSerializer.parse(await actionResponse.text())).toEqual({
      kind: "data",
      data: { count: 9007199254740999n },
      revalidate: [],
    });
  });

  test("custom data serializer round-trips batched route loader data", async () => {
    const litzServer = createServer({
      dataSerializer: bigintSerializer,
      manifest: {
        routes: [
          {
            id: "dashboard.route",
            path: "/dashboard",
            route: {
              options: {
                layout: {
                  id: "dashboard.layout",
                  path: "/dashboard",
                  options: {
                    loader: async () => data({ count: 9007199254741001n }),
                  },
                },
                loader: async () => data({ count: 9007199254741003n }),
              },
            },
          },
        ],
      },
    });
    const batchRequest = createInternalActionRequestInit({
      path: "/dashboard",
      operation: "loader",
      targets: ["dashboard.route", "dashboard.layout"],
    });
    const response = await litzServer.fetch(
      new Request("https://example.com/_litzjs/route", {
        body: batchRequest.body,
        headers: batchRequest.headers,
        method: "POST",
      }),
    );

    expect(bigintSerializer.parse(await response.text())).toEqual({
      kind: "batch",
      results: [
        {
          status: 200,
          body: {
            kind: "data",
            data: { count: 9007199254741003n },
            revalidate: [],
          },
        },
        {
          status: 200,
          body: {
            kind: "data",
            data: { count: 9007199254741001n },
            revalidate: [],
          },
        },
      ],
    });
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

  test("createServer rejects mixed app and manifest inputs", () => {
    const route = defineRoute("/", {
      component() {
        return null;
      },
    });
    const app = defineApp({ routes: [route] });

    expect(() =>
      createServer({
        app,
        manifest: {
          routes: [{ id: "legacy", path: "/", route: route as never }],
        },
      }),
    ).toThrow("Pass either createServer({ app }) or createServer({ manifest }), not both.");
  });

  test("generated runtime options reject server entries not created by createServer", () => {
    expect(() =>
      __withLitzRuntimeOptions(
        {
          fetch: async () => new Response("ok"),
        },
        {
          base: "/app",
          manifest: {},
        },
      ),
    ).toThrow("must export a server created by createServer()");
  });
});
