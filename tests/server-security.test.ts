import { describe, expect, test } from "bun:test";

import { createServer } from "../src/server";
import { createInternalActionRequestInit } from "../src/server/internal-requests";

describe("server security", () => {
  test("forwards cookies and origin to internal route actions without leaking transport headers", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              action(context: unknown) {
                const { request } = context as { request: Request };

                return {
                  kind: "data",
                  data: {
                    cookie: request.headers.get("cookie"),
                    host: request.headers.get("host"),
                    origin: request.headers.get("origin"),
                    internalHeader: request.headers.get("x-litzjs-request"),
                    href: request.url,
                    pathname: new URL(request.url).pathname,
                  },
                };
              },
            },
          },
        ],
      },
    });

    const actionRequest = createInternalActionRequestInit(
      {
        path: "/projects/:id",
        operation: "action",
        request: {
          params: {
            id: "42",
          },
          search: {
            tab: "settings",
          },
        },
      },
      {
        name: "Litz",
      },
    );
    const headers = new Headers(actionRequest.headers);

    headers.set("cookie", "session=top-secret");
    headers.set("host", "app.example.com");
    headers.set("origin", "https://app.example.com");

    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers,
        body: actionRequest.body,
      }),
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      kind: "data";
      data: {
        cookie: string | null;
        host: string | null;
        origin: string | null;
        internalHeader: string | null;
        href: string;
        pathname: string;
      };
    };

    expect(body.kind).toBe("data");
    expect(body.data.cookie).toBe("session=top-secret");
    expect(body.data.host).toBe("app.example.com");
    expect(body.data.origin).toBe("https://app.example.com");
    expect(body.data.internalHeader).toBeNull();
    expect(body.data.href).toBe("https://app.example.com/projects/42?tab=settings");
    expect(body.data.pathname).toBe("/projects/42");
  });

  test("matches base-prefixed internal route actions", async () => {
    const server = createServer({
      base: "/app/",
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              action(context: unknown) {
                const { request } = context as { request: Request };

                return {
                  kind: "data",
                  data: {
                    href: request.url,
                    pathname: new URL(request.url).pathname,
                  },
                };
              },
            },
          },
        ],
      },
    });
    const actionRequest = createInternalActionRequestInit(
      {
        path: "/projects/:id",
        operation: "action",
        request: {
          params: {
            id: "42",
          },
        },
      },
      {
        name: "Litz",
      },
    );

    const response = await server.fetch(
      new Request("https://app.example.com/app/_litzjs/action", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "data";
      data: {
        href: string;
        pathname: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("data");
    expect(body.data.href).toBe("https://app.example.com/projects/42");
    expect(body.data.pathname).toBe("/projects/42");
  });

  test("reuses the original request signal for route handlers", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.update",
            path: "/projects/:id",
            route: {
              action(context: unknown) {
                const { request, signal } = context as {
                  request: Request;
                  signal: AbortSignal;
                };

                return {
                  kind: "data",
                  data: {
                    sameSignal: request.signal === signal,
                  },
                };
              },
            },
          },
        ],
      },
    });
    const actionRequest = createInternalActionRequestInit(
      {
        path: "/projects/:id",
        operation: "action",
        request: {
          params: {
            id: "42",
          },
        },
      },
      {
        name: "Litz",
      },
    );
    const request = new Request("https://app.example.com/_litzjs/action", {
      method: "POST",
      headers: actionRequest.headers,
      body: actionRequest.body,
    });
    const response = await server.fetch(request);
    const body = (await response.json()) as {
      kind: "data";
      data: {
        sameSignal: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.sameSignal).toBe(true);
  });

  test("preserves repeated query params when rebuilding internal route requests", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              loader(context: unknown) {
                const { request } = context as { request: Request };
                const url = new URL(request.url);

                return {
                  kind: "data",
                  data: {
                    href: request.url,
                    tags: url.searchParams.getAll("tag"),
                    term: url.searchParams.get("term"),
                  },
                };
              },
            },
          },
        ],
      },
    });

    const routeRequest = createInternalActionRequestInit(
      {
        path: "/projects/:id",
        target: "projects.show",
        operation: "loader",
        request: {
          params: { id: "42" },
          search: {
            tag: ["framework", "bun"],
            term: "litz",
          },
        },
      },
      {
        reload: true,
      },
    );
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/route", {
        method: "POST",
        headers: routeRequest.headers,
        body: routeRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "data";
      data: {
        href: string;
        tags: string[];
        term: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("data");
    expect(body.data.href).toBe(
      "https://app.example.com/projects/42?tag=framework&tag=bun&term=litz",
    );
    expect(body.data.tags).toEqual(["framework", "bun"]);
    expect(body.data.term).toBe("litz");
  });

  test("supports batched internal route loader requests and preserves requested order", async () => {
    let layoutCalls = 0;
    let routeCalls = 0;

    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              loader(context: unknown) {
                routeCalls += 1;

                const { request, params } = context as {
                  request: Request;
                  params: Record<string, string>;
                };

                return {
                  kind: "data",
                  data: {
                    source: "route",
                    href: request.url,
                    id: params.id,
                  },
                };
              },
              options: {
                layout: {
                  id: "projects.layout",
                  path: "/projects",
                  options: {
                    loader(context: unknown) {
                      layoutCalls += 1;

                      const { request } = context as {
                        request: Request;
                      };

                      return {
                        kind: "data",
                        data: {
                          source: "layout",
                          href: request.url,
                        },
                      };
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });

    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/route", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          path: "/projects/:id",
          targets: ["projects.show", "projects.layout"],
          operation: "loader",
          request: {
            params: { id: "42" },
            search: {
              tab: "settings",
            },
          },
        }),
      }),
    );
    const body = (await response.json()) as {
      kind: "batch";
      results: Array<{
        status: number;
        body: {
          kind: "data";
          data: {
            source: string;
            href: string;
            id?: string;
          };
          revalidate: string[];
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("batch");
    expect(layoutCalls).toBe(1);
    expect(routeCalls).toBe(1);
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toEqual({
      status: 200,
      body: {
        kind: "data",
        data: {
          source: "route",
          href: "https://app.example.com/projects/42?tab=settings",
          id: "42",
        },
        revalidate: [],
      },
    });
    expect(body.results[1]).toEqual({
      status: 200,
      body: {
        kind: "data",
        data: {
          source: "layout",
          href: "https://app.example.com/projects/42?tab=settings",
        },
        revalidate: [],
      },
    });
  });

  test("does not expose unhandled server error messages from api routes", async () => {
    const server = createServer({
      manifest: {
        apiRoutes: [
          {
            path: "/api/private",
            api: {
              methods: {
                GET() {
                  throw new Error("postgres://user:secret@example.com/db");
                },
              },
            },
          },
        ],
      },
    });

    const response = await server.fetch(new Request("https://app.example.com/api/private"));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe("Litz server error.");
    expect(body).not.toContain("postgres://user:secret@example.com/db");
  });

  test("treats malformed percent-encoding in api route pathnames as bad requests", async () => {
    const server = createServer({
      manifest: {
        apiRoutes: [
          {
            path: "/api/projects/:id",
            api: {
              methods: {
                GET() {
                  return new Response("ok");
                },
              },
            },
          },
        ],
      },
    });

    const response = await server.fetch(
      new Request("https://app.example.com/api/projects/%E0%A4%A"),
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toBe("Bad Request");
  });

  test("does not expose unhandled server error messages from route loaders", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "secrets.show",
            path: "/secrets/:id",
            route: {
              loader() {
                throw new Error("SELECT * FROM credentials WHERE token='abc123'");
              },
            },
          },
        ],
      },
    });

    const routeRequest = createInternalActionRequestInit(
      {
        path: "/secrets/:id",
        target: "secrets.show",
        operation: "loader",
        request: {
          params: { id: "1" },
        },
      },
      { name: "Litz" },
    );
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/route", {
        method: "POST",
        headers: routeRequest.headers,
        body: routeRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "fault";
      message: string;
      digest?: string;
    };

    expect(response.status).toBe(500);
    expect(body.kind).toBe("fault");
    expect(body.message).toBe("Internal server error.");
    expect(body.message).not.toContain("SELECT");
    expect(body.message).not.toContain("abc123");
  });

  test("does not expose unhandled server error messages from resource loaders", async () => {
    const server = createServer({
      manifest: {
        resources: [
          {
            path: "/resources/config",
            resource: {
              loader() {
                throw new Error("ENOENT: /etc/shadow");
              },
            },
          },
        ],
      },
    });

    const resourceRequest = createInternalActionRequestInit(
      {
        path: "/resources/config",
        operation: "loader",
        request: {},
      },
      { name: "Litz" },
    );
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: resourceRequest.headers,
        body: resourceRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "fault";
      message: string;
      digest?: string;
    };

    expect(response.status).toBe(500);
    expect(body.kind).toBe("fault");
    expect(body.message).toBe("Internal server error.");
    expect(body.message).not.toContain("ENOENT");
    expect(body.message).not.toContain("/etc/shadow");
  });

  test("does not expose unhandled server error messages from route actions", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "secrets.update",
            path: "/secrets/:id",
            route: {
              action() {
                throw new Error("update credentials set token='abc123'");
              },
            },
          },
        ],
      },
    });

    const actionRequest = createInternalActionRequestInit(
      {
        path: "/secrets/:id",
        operation: "action",
        request: {
          params: { id: "1" },
        },
      },
      { name: "Litz" },
    );
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "fault";
      message: string;
      digest?: string;
    };

    expect(response.status).toBe(500);
    expect(body.kind).toBe("fault");
    expect(body.message).toBe("Internal server error.");
    expect(body.message).not.toContain("update credentials");
    expect(body.message).not.toContain("abc123");
  });

  test("does not expose unhandled server error messages from resource actions", async () => {
    const server = createServer({
      manifest: {
        resources: [
          {
            path: "/resources/config",
            resource: {
              action() {
                throw new Error("permission denied: /etc/shadow");
              },
            },
          },
        ],
      },
    });

    const actionRequest = createInternalActionRequestInit(
      {
        path: "/resources/config",
        operation: "action",
        request: {},
      },
      { name: "Litz" },
    );
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "fault";
      message: string;
      digest?: string;
    };

    expect(response.status).toBe(500);
    expect(body.kind).toBe("fault");
    expect(body.message).toBe("Internal server error.");
    expect(body.message).not.toContain("permission denied");
    expect(body.message).not.toContain("/etc/shadow");
  });

  test("treats missing internal route targets as faults instead of explicit errors", async () => {
    const server = createServer({
      manifest: {
        routes: [],
      },
    });

    const routeRequest = createInternalActionRequestInit(
      {
        path: "/missing/:id",
        target: "missing.show",
        operation: "loader",
        request: {
          params: { id: "1" },
        },
      },
      { reload: true },
    );
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/route", {
        method: "POST",
        headers: routeRequest.headers,
        body: routeRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "fault";
      message: string;
    };

    expect(response.status).toBe(404);
    expect(body.kind).toBe("fault");
    expect(body.message).toBe("Route not found.");
  });

  test("treats missing internal resource handlers as faults instead of explicit errors", async () => {
    const server = createServer({
      manifest: {
        resources: [
          {
            path: "/resources/config",
            resource: {
              action() {
                return { kind: "data", data: { ok: true } };
              },
            },
          },
        ],
      },
    });

    const resourceRequest = createInternalActionRequestInit(
      {
        path: "/resources/config",
        operation: "loader",
        request: {},
      },
      { reload: true },
    );
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: resourceRequest.headers,
        body: resourceRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "fault";
      message: string;
    };

    expect(response.status).toBe(405);
    expect(body.kind).toBe("fault");
    expect(body.message).toBe("Resource does not define a loader.");
  });
});
