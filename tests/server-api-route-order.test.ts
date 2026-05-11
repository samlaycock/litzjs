import { describe, expect, test } from "bun:test";

import { createServer } from "../src/server";

describe("createServer API route ordering", () => {
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
});
