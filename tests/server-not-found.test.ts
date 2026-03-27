import { describe, expect, test } from "bun:test";

import { createServer } from "../src/server";

describe("server not-found handling", () => {
  test("prefers custom notFound responses over the document for unmatched routes", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects.show",
            path: "/projects/:id",
            route: {},
          },
        ],
      },
      document: '<!doctype html><html><body><div id="app">app</div></body></html>',
      notFound: "<!doctype html><html><body><h1>Missing</h1></body></html>",
    });

    const matchedResponse = await server.fetch(
      new Request("https://app.example.com/projects/42", {
        headers: {
          accept: "text/html",
        },
      }),
    );

    expect(matchedResponse.status).toBe(200);
    expect(await matchedResponse.text()).toContain('id="app"');

    const missingResponse = await server.fetch(
      new Request("https://app.example.com/missing", {
        headers: {
          accept: "text/html",
        },
      }),
    );

    expect(missingResponse.status).toBe(404);
    expect(missingResponse.headers.get("content-type")).toContain("text/html");
    expect(await missingResponse.text()).toContain("<h1>Missing</h1>");
  });

  test("keeps asset handling ahead of custom notFound responses", async () => {
    const server = createServer({
      notFound: "<!doctype html><html><body><h1>Missing</h1></body></html>",
      assets(request) {
        if (new URL(request.url).pathname === "/logo.svg") {
          return new Response("<svg />", {
            headers: {
              "content-type": "image/svg+xml",
            },
          });
        }

        return null;
      },
    });

    const response = await server.fetch(
      new Request("https://app.example.com/logo.svg", {
        headers: {
          accept: "image/svg+xml",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(await response.text()).toBe("<svg />");
  });
});
