import { describe, expect, test } from "bun:test";

import { formJson } from "../src";
import { createServer } from "../src/server";
import {
  createInternalActionRequestInit,
  MalformedInternalRequestError,
  parseInternalRequestBody,
} from "../src/server/internal-requests";

describe("internal action requests", () => {
  test("preserves File uploads through the internal action transport", async () => {
    const formData = new FormData();
    const upload = new File(["hello litz"], "greeting.txt", {
      type: "text/plain",
    });

    formData.append("title", "Release Notes");
    formData.append("upload", upload);

    const actionRequest = createInternalActionRequestInit(
      {
        path: "/upload",
        operation: "action",
        request: {
          params: {},
          search: {},
        },
      },
      formData,
    );

    const parsed = await parseInternalRequestBody(
      new Request("http://litz.local/_litzjs/action", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );

    expect(parsed.path).toBe("/upload");
    expect(parsed.operation).toBe("action");
    expect(parsed.payload?.type).toBe("form-data");

    const title = parsed.payload?.entries.find(([key]) => key === "title")?.[1];
    const receivedUpload = parsed.payload?.entries.find(([key]) => key === "upload")?.[1];

    expect(title).toBe("Release Notes");
    expect(receivedUpload).toBeInstanceOf(File);
    expect((receivedUpload as File).name).toBe("greeting.txt");
    expect(await (receivedUpload as File).text()).toBe("hello litz");
  });

  test("serializes explicit JSON payload values consistently for internal actions", async () => {
    const actionRequest = createInternalActionRequestInit(
      {
        path: "/projects",
        operation: "action",
      },
      {
        name: "Litz",
        metadata: formJson({
          published: false,
          tags: ["framework"],
        }),
      },
    );

    const parsed = await parseInternalRequestBody(
      new Request("http://litz.local/_litzjs/action", {
        method: "POST",
        headers: actionRequest.headers,
        body: actionRequest.body,
      }),
    );

    expect(parsed.payload?.entries).toEqual([
      ["name", "Litz"],
      ["metadata", JSON.stringify({ published: false, tags: ["framework"] })],
    ]);
  });

  test("rejects implicit object payload values for internal actions", () => {
    expect(() =>
      createInternalActionRequestInit(
        {
          path: "/projects",
          operation: "action",
        },
        {
          metadata: {
            published: false,
          } as never,
        },
      ),
    ).toThrow(/formJson/);
  });

  test("rejects null payload values instead of coercing them to empty strings", () => {
    expect(() =>
      createInternalActionRequestInit(
        {
          path: "/projects",
          operation: "action",
        },
        {
          nickname: null as never,
        },
      ),
    ).toThrow(/null/);
  });

  test("rejects malformed JSON bodies as malformed internal requests", async () => {
    try {
      await parseInternalRequestBody(
        new Request("http://litz.local/_litzjs/resource", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: '{"secret":"do-not-leak"',
        }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedInternalRequestError);
      return;
    }

    throw new Error("Expected malformed JSON body to be rejected");
  });

  test("rejects malformed internal metadata headers as malformed internal requests", async () => {
    try {
      await parseInternalRequestBody(
        new Request("http://litz.local/_litzjs/action", {
          method: "POST",
          headers: {
            "x-litzjs-request": '{"secret":"do-not-leak"',
          },
          body: new FormData(),
        }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedInternalRequestError);
      return;
    }

    throw new Error("Expected malformed metadata header to be rejected");
  });

  test("rejects malformed multipart bodies as malformed internal requests", async () => {
    try {
      await parseInternalRequestBody(
        new Request("http://litz.local/_litzjs/action", {
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=litz-boundary",
            "x-litzjs-request": JSON.stringify({
              path: "/projects",
              operation: "action",
            }),
          },
          body: "--not-the-declared-boundary\r\n",
        }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedInternalRequestError);
      return;
    }

    throw new Error("Expected malformed multipart body to be rejected");
  });

  test("returns a safe 400 response for malformed internal JSON bodies", async () => {
    const server = createServer({
      manifest: {
        resources: [
          {
            path: "/projects",
            resource: {
              loader() {
                return { kind: "data", data: { ok: true } };
              },
            },
          },
        ],
      },
    });
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/resource", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: '{"secret":"do-not-leak"',
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain("Malformed internal request.");
    expect(text).not.toContain("do-not-leak");
  });

  test("returns a safe 400 response for malformed internal metadata headers", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects",
            path: "/projects",
            route: {
              action() {
                return { kind: "data", data: { ok: true } };
              },
            },
          },
        ],
      },
    });
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers: {
          "x-litzjs-request": '{"secret":"do-not-leak"',
        },
        body: new FormData(),
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain("Malformed internal request.");
    expect(text).not.toContain("do-not-leak");
  });

  test("returns a safe 400 response for malformed multipart bodies", async () => {
    const server = createServer({
      manifest: {
        routes: [
          {
            id: "projects",
            path: "/projects",
            route: {
              action() {
                return { kind: "data", data: { ok: true } };
              },
            },
          },
        ],
      },
    });
    const response = await server.fetch(
      new Request("https://app.example.com/_litzjs/action", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=litz-boundary",
          "x-litzjs-request": JSON.stringify({
            path: "/projects",
            operation: "action",
          }),
        },
        body: "--not-the-declared-boundary\r\nsecret=do-not-leak\r\n",
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain("Malformed internal request.");
    expect(text).not.toContain("do-not-leak");
  });
});
