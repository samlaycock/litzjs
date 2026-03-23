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

  test("does not expose unhandled server error messages", async () => {
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
});
