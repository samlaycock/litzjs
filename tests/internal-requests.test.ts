import { describe, expect, test } from "bun:test";

import {
  createInternalActionRequestInit,
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
      new Request("http://litz.local/_litz/action", {
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

  test("serializes object payload values consistently for internal actions", async () => {
    const actionRequest = createInternalActionRequestInit(
      {
        path: "/projects",
        operation: "action",
      },
      {
        name: "Litz",
        metadata: {
          published: false,
          tags: ["framework"],
        },
      },
    );

    const parsed = await parseInternalRequestBody(
      new Request("http://litz.local/_litz/action", {
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
});
