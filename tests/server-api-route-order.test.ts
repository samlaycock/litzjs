import { describe, expect, test } from "bun:test";

import { createServer } from "../src/server";

describe("createServer API route ordering", () => {
  test("checks more specific document routes before dynamic routes in direct manifests", async () => {
    const pathAccesses: string[] = [];
    const dynamicRoute = {
      id: "/users/:id",
      get path() {
        pathAccesses.push("dynamic");
        return "/users/:id";
      },
    };
    const staticRoute = {
      id: "/users/me",
      get path() {
        pathAccesses.push("static");
        return "/users/me";
      },
    };
    const server = createServer({
      document: "Document",
      manifest: {
        routes: [dynamicRoute, staticRoute],
      },
    });

    pathAccesses.length = 0;

    const response = await server.fetch(
      new Request("https://example.com/users/me", {
        headers: { accept: "text/html" },
      }),
    );

    expect(response.status).toBe(200);
    expect(pathAccesses).toEqual(["static"]);
  });

  test("matches more specific static API routes before dynamic routes in direct manifests", async () => {
    const server = createServer({
      manifest: {
        apiRoutes: [
          {
            path: "/api/users/:id",
            api: {
              methods: {
                GET({ params }) {
                  return Response.json({ route: "dynamic", params });
                },
              },
            },
          },
          {
            path: "/api/users/me",
            api: {
              methods: {
                GET() {
                  return Response.json({ route: "static" });
                },
              },
            },
          },
        ],
      },
    });

    const response = await server.fetch(new Request("https://example.com/api/users/me"));
    const body = (await response.json()) as { route: string };

    expect(response.status).toBe(200);
    expect(body.route).toBe("static");
  });

  test("uses GET handlers for HEAD API requests without returning a body", async () => {
    let method = "";
    let cancelled = false;
    const server = createServer({
      manifest: {
        apiRoutes: [
          {
            path: "/api/status",
            api: {
              methods: {
                GET({ request }) {
                  method = request.method;

                  return new Response(
                    new ReadableStream({
                      cancel() {
                        cancelled = true;
                      },
                    }),
                    {
                      headers: {
                        "x-status": "ready",
                      },
                    },
                  );
                },
              },
            },
          },
        ],
      },
    });

    const response = await server.fetch(
      new Request("https://example.com/api/status", {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-status")).toBe("ready");
    expect(await response.text()).toBe("");
    expect(method).toBe("HEAD");
    expect(cancelled).toBe(true);
  });

  test("includes Allow headers on API method-not-allowed responses", async () => {
    const server = createServer({
      manifest: {
        apiRoutes: [
          {
            path: "/api/status",
            api: {
              methods: {
                GET() {
                  return new Response("ready");
                },
                POST() {
                  return new Response("updated");
                },
              },
            },
          },
        ],
      },
    });

    const response = await server.fetch(
      new Request("https://example.com/api/status", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, POST");
  });

  test("includes Allow headers on internal endpoint method-not-allowed responses", async () => {
    const server = createServer({
      manifest: {
        routes: [],
        resources: [],
      },
    });

    const routeResponse = await server.fetch(
      new Request("https://example.com/_litzjs/route", {
        method: "GET",
      }),
    );
    const resourceResponse = await server.fetch(
      new Request("https://example.com/_litzjs/resource", {
        method: "GET",
      }),
    );

    expect(routeResponse.status).toBe(405);
    expect(routeResponse.headers.get("allow")).toBe("POST");
    expect(resourceResponse.status).toBe(405);
    expect(resourceResponse.headers.get("allow")).toBe("POST");
  });
});
