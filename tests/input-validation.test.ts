import { describe, expect, test } from "bun:test";

import { data, defineApiRoute, defineResource, defineRoute, error, invalid } from "../src/index";
import { createServer } from "../src/server";
import { createInternalActionRequestInit } from "../src/server/internal-requests";

describe("input validation hooks", () => {
  test("route loaders expose parsed params, search, and headers through input", async () => {
    const route = defineRoute("/projects/:id", {
      component() {
        return null;
      },
      input: {
        params(params: any) {
          return {
            projectId: Number(params.id),
          };
        },
        search(search: any) {
          return {
            tab: search.get("tab") ?? "overview",
          };
        },
        headers(headers: any) {
          return {
            tenant: headers.get("x-tenant") ?? "guest",
          };
        },
      } as any,
      async loader({ input, params }) {
        const validatedInput = input as any;

        return data({
          rawId: params.id,
          projectId: validatedInput.params.projectId,
          tab: validatedInput.search.tab,
          tenant: validatedInput.headers.tenant,
          bodyMissing: validatedInput.body === undefined,
        });
      },
    });
    const app = createServer({
      manifest: {
        routes: [{ id: route.id, path: route.path, route: route as any }],
      },
    });

    const response = await app.fetch(
      new Request("https://app.example.com/_litzjs/route", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant": "acme",
        },
        body: JSON.stringify({
          path: route.path,
          target: route.id,
          operation: "loader",
          request: {
            params: {
              id: "42",
            },
            search: {
              tab: "settings",
            },
          },
        }),
      }),
    );
    const body = (await response.json()) as {
      kind: "data";
      data: {
        rawId: string;
        projectId: number;
        tab: string;
        tenant: string;
        bodyMissing: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("data");
    expect(body.data).toEqual({
      rawId: "42",
      projectId: 42,
      tab: "settings",
      tenant: "acme",
      bodyMissing: true,
    });
  });

  test("route actions can parse body input without consuming the original request", async () => {
    const route = defineRoute("/projects/:id", {
      component() {
        return null;
      },
      input: {
        async body(request: any) {
          const formData = await request.formData();

          return {
            name: String(formData.get("name") ?? ""),
          };
        },
      } as any,
      async action({ input, request }) {
        const validatedInput = input as any;
        const formData = await request.formData();

        return data({
          parsedName: validatedInput.body?.name ?? null,
          rawName: formData.get("name"),
        });
      },
    });
    const app = createServer({
      manifest: {
        routes: [{ id: route.id, path: route.path, route: route as any }],
      },
    });
    const actionRequest = createInternalActionRequestInit(
      {
        path: route.path,
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

    const response = await app.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "data";
      data: {
        parsedName: string | null;
        rawName: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("data");
    expect(body.data).toEqual({
      parsedName: "Litz",
      rawName: "Litz",
    });
  });

  test("resource actions can short-circuit with invalid results from input body parsing", async () => {
    let actionCalls = 0;

    const resource = defineResource("/resource/projects/:id", {
      component() {
        return null;
      },
      input: {
        async body(request: any) {
          const formData = await request.formData();
          const name = formData.get("name");

          if (typeof name !== "string" || !name.trim()) {
            throw invalid({
              fields: {
                name: "Name is required.",
              },
            });
          }

          return {
            name,
          };
        },
      } as any,
      async action({ input }) {
        actionCalls += 1;
        const validatedInput = input as any;
        return data({
          name: validatedInput.body?.name ?? null,
        });
      },
    });
    const app = createServer({
      manifest: {
        resources: [{ path: resource.path, resource: resource as any }],
      },
    });
    const actionRequest = createInternalActionRequestInit(
      {
        path: resource.path,
        operation: "action",
        request: {
          params: {
            id: "42",
          },
        },
      },
      {},
    );

    const response = await app.fetch(
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );
    const body = (await response.json()) as {
      kind: "invalid";
      fields?: Record<string, string>;
    };

    expect(response.status).toBe(422);
    expect(body.kind).toBe("invalid");
    expect(body.fields).toEqual({
      name: "Name is required.",
    });
    expect(actionCalls).toBe(0);
  });

  test("api routes expose parsed params and body through input", async () => {
    const api = defineApiRoute("/api/projects/:id", {
      input: {
        params(params: any) {
          return {
            projectId: Number(params.id),
          };
        },
        async body(request: any) {
          return (await request.json()) as {
            name: string;
          };
        },
      } as any,
      POST({ input }) {
        const validatedInput = input as any;
        return Response.json({
          id: validatedInput.params.projectId,
          name: validatedInput.body?.name ?? null,
        });
      },
    });
    const app = createServer({
      manifest: {
        apiRoutes: [{ path: api.path, api: api as any }],
      },
    });

    const response = await app.fetch(
      new Request("https://app.example.com/api/projects/7", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Litz",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 7,
      name: "Litz",
    });
  });

  test("api input parsers can throw result helpers to return validation responses", async () => {
    const api = defineApiRoute("/api/projects/:id", {
      input: {
        async body(request: any) {
          const body = (await request.json()) as {
            name?: unknown;
          };

          if (typeof body.name !== "string" || !body.name.trim()) {
            throw error(400, "Project name must be a non-empty string.");
          }

          return body;
        },
      } as any,
      POST() {
        return Response.json({ ok: true });
      },
    });
    const app = createServer({
      manifest: {
        apiRoutes: [{ path: api.path, api: api as any }],
      },
    });

    const response = await app.fetch(
      new Request("https://app.example.com/api/projects/7", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Project name must be a non-empty string.",
      code: undefined,
      data: undefined,
    });
  });
});
