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

  test("supports function-form notFound handlers and falls back to the document when they return null", async () => {
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
      notFound(request) {
        const pathname = new URL(request.url).pathname;

        if (pathname === "/missing-hard") {
          return new Response("<!doctype html><html><body><h1>Hard missing</h1></body></html>", {
            status: 404,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          });
        }

        return null;
      },
    });

    const fallbackResponse = await server.fetch(
      new Request("https://app.example.com/missing-soft", {
        headers: {
          accept: "text/html",
        },
      }),
    );

    expect(fallbackResponse.status).toBe(200);
    expect(await fallbackResponse.text()).toContain('id="app"');

    const handledResponse = await server.fetch(
      new Request("https://app.example.com/missing-hard", {
        headers: {
          accept: "text/html",
        },
      }),
    );

    expect(handledResponse.status).toBe(404);
    expect(await handledResponse.text()).toContain("<h1>Hard missing</h1>");
  });

  test("clones prebuilt document and notFound responses before returning them", async () => {
    const sharedDocument = new Response(
      '<!doctype html><html><body><div id="app">app</div></body></html>',
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
    const sharedNotFound = new Response(
      "<!doctype html><html><body><h1>Missing</h1></body></html>",
      {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
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
      document: sharedDocument,
      notFound: sharedNotFound,
    });

    const matchedFirst = await server.fetch(
      new Request("https://app.example.com/projects/42", {
        headers: {
          accept: "text/html",
        },
      }),
    );
    const matchedSecond = await server.fetch(
      new Request("https://app.example.com/projects/7", {
        headers: {
          accept: "text/html",
        },
      }),
    );
    const missingFirst = await server.fetch(
      new Request("https://app.example.com/missing-a", {
        headers: {
          accept: "text/html",
        },
      }),
    );
    const missingSecond = await server.fetch(
      new Request("https://app.example.com/missing-b", {
        headers: {
          accept: "text/html",
        },
      }),
    );

    expect(await matchedFirst.text()).toContain('id="app"');
    expect(await matchedSecond.text()).toContain('id="app"');
    expect(await missingFirst.text()).toContain("<h1>Missing</h1>");
    expect(await missingSecond.text()).toContain("<h1>Missing</h1>");
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
