import { afterEach, describe, expect, test } from "bun:test";

import { defineApiRoute } from "../src/index";
import { createServer } from "../src/server";
import { createInternalActionRequestInit } from "../src/server/internal-requests";

const originalFetch = globalThis.fetch;

describe("wildcard path interpolation", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("interpolates wildcard params for internal route actions", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "docs.show",
            path: "/docs/*slug",
            route: {
              action(context: unknown) {
                const { params, request } = context as {
                  params: Record<string, string>;
                  request: Request;
                };

                return {
                  kind: "data",
                  data: {
                    slug: params.slug,
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
        path: "/docs/*slug",
        operation: "action",
        request: {
          params: {
            slug: "guides/getting started",
          },
          search: {
            tab: "install",
          },
        },
      },
      {
        name: "Litz",
      },
    );

    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );

    const body = (await response.json()) as {
      kind: "data";
      data: {
        slug: string;
        href: string;
        pathname: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.slug).toBe("guides/getting started");
    expect(body.data.href).toBe(
      "https://app.example.com/docs/guides/getting%20started?tab=install",
    );
    expect(body.data.pathname).toBe("/docs/guides/getting%20started");
  });

  test("interpolates wildcard params for internal resource requests", async () => {
    const server = createServer({
      manifest: {
        resources: [
          {
            path: "/resource/docs/*slug",
            resource: {
              loader(context: unknown) {
                const { params, request } = context as {
                  params: Record<string, string>;
                  request: Request;
                };

                return {
                  kind: "data",
                  data: {
                    slug: params.slug,
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

    const resourceRequest = createInternalActionRequestInit({
      path: "/resource/docs/*slug",
      operation: "loader",
      request: {
        params: {
          slug: "guides/getting started",
        },
        search: {
          format: "json",
        },
      },
    });

    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: resourceRequest.headers,
        body: resourceRequest.body,
      }),
    );

    const body = (await response.json()) as {
      kind: "data";
      data: {
        slug: string;
        href: string;
        pathname: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.slug).toBe("guides/getting started");
    expect(body.data.href).toBe(
      "https://app.example.com/resource/docs/guides/getting%20started?format=json",
    );
    expect(body.data.pathname).toBe("/resource/docs/guides/getting%20started");
  });

  test("interpolates wildcard params for api.fetch", async () => {
    const api = defineApiRoute("/api/docs/*slug", {
      GET() {
        return Response.json({ ok: true });
      },
    });

    let receivedInput: RequestInfo | URL | undefined;
    let receivedInit: RequestInit | undefined;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      receivedInput = input;
      receivedInit = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const response = await api.fetch({
      params: {
        slug: "guides/getting started",
      },
      search: {
        tab: "install",
      },
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    expect(response.status).toBe(204);
    expect(receivedInput).toBe("/api/docs/guides/getting%20started?tab=install");
    expect(receivedInit?.method).toBe("GET");
    expect(new Headers(receivedInit?.headers).get("accept")).toBe("application/json");
  });
});
