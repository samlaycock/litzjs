import { describe, expect, test } from "bun:test";

import { createNitroHandler } from "../src/server/nitro";

describe("createNitroHandler", () => {
  test("delegates to the litz server fetch and returns the response", async () => {
    const handler = createNitroHandler({
      manifest: {
        apiRoutes: [
          {
            path: "/api/ping",
            api: {
              methods: {
                GET() {
                  return new Response(JSON.stringify({ pong: true }), {
                    headers: { "content-type": "application/json" },
                  });
                },
              },
            },
          },
        ],
      },
    });

    const request = new Request("https://example.com/api/ping");
    const event = { req: request } as Parameters<typeof handler>[0];
    const response = await handler(event);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { pong: boolean };

    expect(body.pong).toBe(true);
  });

  test("passes through error responses from the server", async () => {
    const handler = createNitroHandler({
      manifest: {
        apiRoutes: [
          {
            path: "/api/fail",
            api: {
              methods: {
                GET() {
                  throw new Error("something went wrong");
                },
              },
            },
          },
        ],
      },
    });

    const request = new Request("https://example.com/api/fail");
    const event = { req: request } as Parameters<typeof handler>[0];
    const response = await handler(event);

    expect(response.status).toBe(500);

    const body = await response.text();

    expect(body).toBe("Litz server error.");
  });

  test("supports POST requests with body", async () => {
    const handler = createNitroHandler({
      manifest: {
        apiRoutes: [
          {
            path: "/api/echo",
            api: {
              methods: {
                async POST(context: unknown) {
                  const { request } = context as { request: Request };
                  const data = await request.json();

                  return new Response(JSON.stringify({ echo: data }), {
                    headers: { "content-type": "application/json" },
                  });
                },
              },
            },
          },
        ],
      },
    });

    const request = new Request("https://example.com/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    const event = { req: request } as Parameters<typeof handler>[0];
    const response = await handler(event);

    expect(response.status).toBe(200);

    const body = (await response.json()) as { echo: { message: string } };

    expect(body.echo.message).toBe("hello");
  });

  test("creates handler with default options", async () => {
    const handler = createNitroHandler();

    const request = new Request("https://example.com/unknown-path");
    const event = { req: request } as Parameters<typeof handler>[0];
    const response = await handler(event);

    expect(response).toBeInstanceOf(Response);
  });
});
