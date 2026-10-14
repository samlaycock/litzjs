import { describe, expect, test } from "bun:test";

import { createServer } from "../src/server";
import { createInternalActionRequestInit } from "../src/server/internal-requests";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;

  return {
    promise: new Promise<T>((nextResolve) => {
      resolve = nextResolve;
    }),
    resolve,
  };
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("waitForCondition: condition was not met within the allotted attempts");
}

describe("server security", () => {
  test("can reject internal route actions before the handler dispatches", async () => {
    let actionCalls = 0;

    const server = createServer({
      validateInternalRequest({ kind, operation, request }) {
        if (
          kind === "route" &&
          operation === "action" &&
          request.headers.get("origin") !== "https://app.example.com"
        ) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
      },
      manifest: {
        routes: [
          {
            id: "projects.update",
            path: "/projects/:id",
            route: {
              action() {
                actionCalls += 1;

                return { kind: "data", data: { ok: true } };
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
    const headers = new Headers(actionRequest.headers);

    headers.set("origin", "https://attacker.example.com");

    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers,
        body: actionRequest.body,
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(actionCalls).toBe(0);
  });

  test("can reject internal resource actions before the handler dispatches", async () => {
    let actionCalls = 0;

    const server = createServer({
      validateInternalRequest({ kind, operation, request }) {
        if (
          kind === "resource" &&
          operation === "action" &&
          request.headers.get("x-csrf-token") !== "trusted"
        ) {
          return new Response("Forbidden", { status: 403 });
        }
      },
      manifest: {
        resources: [
          {
            path: "/resources/projects/:id",
            resource: {
              action() {
                actionCalls += 1;

                return { kind: "data", data: { ok: true } };
              },
            },
          },
        ],
      },
    });
    const actionRequest = createInternalActionRequestInit(
      {
        path: "/resources/projects/:id",
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
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(body).toBe("Forbidden");
    expect(actionCalls).toBe(0);
  });

  test("allows internal writes when validateInternalRequest does not return a response", async () => {
    let validatedPath: string | undefined;

    const server = createServer({
      validateInternalRequest({ kind, operation, path, request }) {
        if (kind === "route" && operation === "action") {
          validatedPath = path;
          expect(request.headers.get("x-csrf-token")).toBe("trusted");
        }
      },
      manifest: {
        routes: [
          {
            id: "projects.update",
            path: "/projects/:id",
            route: {
              action() {
                return { kind: "data", data: { ok: true } };
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
    const headers = new Headers(actionRequest.headers);

    headers.set("x-csrf-token", "trusted");

    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers,
        body: actionRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "data";
      data: { ok: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("data");
    expect(body.data.ok).toBe(true);
    expect(validatedPath).toBe("/projects/:id");
  });

  test("can allow loader-only internal requests while rejecting writes", async () => {
    let loaderCalls = 0;

    const server = createServer({
      validateInternalRequest({ operation, request }) {
        if (operation === "action" && request.headers.get("origin") !== "https://app.example.com") {
          return new Response("Forbidden", { status: 403 });
        }
      },
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              loader() {
                loaderCalls += 1;

                return { kind: "data", data: { ok: true } };
              },
            },
          },
        ],
      },
    });
    const loaderRequest = createInternalActionRequestInit(
      {
        path: "/projects/:id",
        target: "projects.show",
        operation: "loader",
        request: {
          params: {
            id: "42",
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
        headers: loaderRequest.headers,
        body: loaderRequest.body,
      }),
    );

    expect(response.status).toBe(200);
    expect(loaderCalls).toBe(1);
  });

  test("passes createContext values to internal request validators", async () => {
    const observedContexts: unknown[] = [];

    const server = createServer({
      createContext() {
        return {
          sessionId: "session-123",
        };
      },
      validateInternalRequest({ context }) {
        observedContexts.push(context);
      },
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              loader() {
                return { kind: "data", data: { ok: true } };
              },
            },
          },
        ],
        resources: [
          {
            path: "/resources/projects/:id",
            resource: {
              loader() {
                return { kind: "data", data: { ok: true } };
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
          params: {
            id: "42",
          },
        },
      },
      {
        reload: true,
      },
    );
    const resourceRequest = createInternalActionRequestInit(
      {
        path: "/resources/projects/:id",
        operation: "loader",
        request: {
          params: {
            id: "42",
          },
        },
      },
      {
        reload: true,
      },
    );

    const routeResponse = await server.fetch(
      new Request("https://app.example.com/_litzjs/route", {
        method: "POST",
        headers: routeRequest.headers,
        body: routeRequest.body,
      }),
    );
    const resourceResponse = await server.fetch(
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: resourceRequest.headers,
        body: resourceRequest.body,
      }),
    );

    expect(routeResponse.status).toBe(200);
    expect(resourceResponse.status).toBe(200);
    expect(observedContexts).toEqual([{ sessionId: "session-123" }, { sessionId: "session-123" }]);
  });

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

  test("serializes partial batched route loader failures without rerunning successful siblings", async () => {
    let layoutCalls = 0;
    let routeCalls = 0;

    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              loader() {
                routeCalls += 1;
                throw new Error("route loader failed");
              },
              options: {
                layout: {
                  id: "projects.layout",
                  path: "/projects",
                  options: {
                    loader() {
                      layoutCalls += 1;

                      return {
                        kind: "data",
                        data: {
                          source: "layout",
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
          targets: ["projects.layout", "projects.show"],
          operation: "loader",
          request: {
            params: { id: "42" },
          },
        }),
      }),
    );
    const body = (await response.json()) as {
      kind: "batch";
      results: Array<{
        status: number;
        body: {
          kind: "data" | "fault";
          data?: {
            source: string;
          };
          message?: string;
          revalidate?: string[];
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("batch");
    expect(layoutCalls).toBe(1);
    expect(routeCalls).toBe(1);
    expect(body.results).toEqual([
      {
        status: 200,
        body: {
          kind: "data",
          data: {
            source: "layout",
          },
          revalidate: [],
        },
      },
      {
        status: 500,
        body: {
          kind: "fault",
          message: "Internal server error.",
        },
      },
    ]);
  });

  test("applies batched loader cookies and cache policy to the response instead of the JSON body", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              loader() {
                const headers = new Headers({
                  "cache-control": "private, max-age=60",
                  "x-litzjs-public-source": "route",
                  "x-internal-trace": "route-trace",
                });
                headers.append("set-cookie", "theme=dark; Path=/");

                return {
                  kind: "data",
                  headers,
                  data: { source: "route" },
                };
              },
              options: {
                layout: {
                  id: "projects.layout",
                  path: "/projects",
                  options: {
                    loader() {
                      return {
                        kind: "data",
                        headers: {
                          "set-cookie": "session=TEST_ONLY; Path=/; HttpOnly; Secure",
                          "cache-control": "no-store",
                        },
                        data: { source: "layout" },
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
          targets: ["projects.layout", "projects.show"],
          operation: "loader",
          request: {
            params: { id: "42" },
          },
        }),
      }),
    );
    const bodyText = await response.text();
    const body = JSON.parse(bodyText) as {
      kind: "batch";
      results: Array<{ status: number; headers?: Array<[string, string]> }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      "session=TEST_ONLY; Path=/; HttpOnly; Secure",
      "theme=dark; Path=/",
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(bodyText).not.toContain("TEST_ONLY");
    expect(bodyText).not.toContain("theme=dark");
    expect(bodyText).not.toContain("route-trace");
    expect(body.results[0]?.headers).toBeUndefined();
    expect(body.results[1]?.headers).toEqual([["x-litzjs-public-source", "route"]]);
  });

  test("marks batched loader responses private when any loader response is private", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              loader() {
                return {
                  kind: "data",
                  headers: { "cache-control": "private, max-age=60" },
                  data: { source: "route" },
                };
              },
              options: {
                layout: {
                  id: "projects.layout",
                  path: "/projects",
                  options: {
                    loader() {
                      return {
                        kind: "data",
                        headers: { "cache-control": "public, max-age=300" },
                        data: { source: "layout" },
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
          targets: ["projects.layout", "projects.show"],
          operation: "loader",
          request: {
            params: { id: "42" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
  });

  test("executes batched internal route loader requests concurrently", async () => {
    const startedTargets: string[] = [];
    const routeDeferred = createDeferred<string>();
    const layoutDeferred = createDeferred<string>();

    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {
              async loader() {
                startedTargets.push("route");

                return {
                  kind: "data",
                  data: {
                    source: await routeDeferred.promise,
                  },
                };
              },
              options: {
                layout: {
                  id: "projects.layout",
                  path: "/projects",
                  options: {
                    async loader() {
                      startedTargets.push("layout");

                      return {
                        kind: "data",
                        data: {
                          source: await layoutDeferred.promise,
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

    const responsePromise = server.fetch(
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
          },
        }),
      }),
    );

    await waitForCondition(() => startedTargets.length === 2);

    expect(startedTargets).toEqual(["route", "layout"]);

    layoutDeferred.resolve("layout");
    routeDeferred.resolve("route");

    const response = await responsePromise;
    const body = (await response.json()) as {
      kind: "batch";
      results: Array<{
        body: {
          kind: "data";
          data: {
            source: string;
          };
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.results.map((result) => result.body.data.source)).toEqual(["route", "layout"]);
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

  describe("batched route loader targets", () => {
    function createBatchServer() {
      const calls = { route: 0, layout: 0, middleware: 0 };
      const countMiddleware = (_context: unknown, next: () => Promise<unknown>) => {
        calls.middleware += 1;
        return next();
      };
      const server = createServer({
        manifest: {
          routes: [
            {
              id: "projects.show",
              path: "/projects/:id",
              route: {
                loader() {
                  calls.route += 1;
                  return { kind: "data", data: "route" };
                },
                options: {
                  middleware: [countMiddleware],
                  layout: {
                    id: "projects.layout",
                    path: "/projects",
                    options: {
                      middleware: [countMiddleware],
                      loader() {
                        calls.layout += 1;
                        return { kind: "data", data: "layout" };
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      });

      return { calls, server };
    }

    function requestBatch(server: ReturnType<typeof createServer>, targets: unknown) {
      return server.fetch(
        new Request("https://app.example.com/_litzjs/route", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            path: "/projects/:id",
            targets,
            operation: "loader",
            request: { params: { id: "42" } },
          }),
        }),
      );
    }

    test("rejects duplicate targets without running any loaders", async () => {
      const { calls, server } = createBatchServer();
      const response = await requestBatch(server, ["projects.show", "projects.show"]);
      const body = (await response.json()) as { kind: string; message: string };

      expect(response.status).toBe(400);
      expect(body).toEqual({ kind: "fault", message: "Malformed internal request." });
      expect(calls).toEqual({ route: 0, layout: 0, middleware: 0 });
    });

    test("rejects large repeated target arrays without amplifying loader work", async () => {
      const { calls, server } = createBatchServer();
      const response = await requestBatch(server, Array(1000).fill("projects.show"));

      expect(response.status).toBe(400);
      expect(calls).toEqual({ route: 0, layout: 0, middleware: 0 });
    });

    test("rejects more targets than the route match chain contains", async () => {
      const { calls, server } = createBatchServer();
      const response = await requestBatch(server, [
        "projects.layout",
        "projects.show",
        "projects.other",
      ]);

      expect(response.status).toBe(400);
      expect(calls).toEqual({ route: 0, layout: 0, middleware: 0 });
    });

    test("rejects non-array and non-string targets as malformed", async () => {
      const { calls, server } = createBatchServer();
      const nonArrayResponse = await requestBatch(server, "projects.show");
      const nullResponse = await requestBatch(server, null);
      const nonStringResponse = await requestBatch(server, ["projects.show", 42]);

      expect(nonArrayResponse.status).toBe(400);
      expect(nullResponse.status).toBe(400);
      expect(nonStringResponse.status).toBe(400);
      expect(calls).toEqual({ route: 0, layout: 0, middleware: 0 });
    });

    test("runs each distinct target in the match chain exactly once", async () => {
      const { calls, server } = createBatchServer();
      const response = await requestBatch(server, ["projects.layout", "projects.show"]);
      const body = (await response.json()) as { kind: string; results: unknown[] };

      expect(response.status).toBe(200);
      expect(body.kind).toBe("batch");
      expect(body.results).toHaveLength(2);
      expect(calls).toEqual({ route: 1, layout: 1, middleware: 3 });
    });
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
