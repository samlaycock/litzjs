import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";

import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import {
  discoverServerEntry,
  handleLitzApiRequest,
  handleLitzResourceRequest,
  handleLitzRouteRequest,
  transformServerModuleSource,
} from "../src/vite";

describe("vite production server helpers", () => {
  test("prefers src/server.ts when auto-discovering a custom server entry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      mkdirSync(path.join(root, "src", "server"), { recursive: true });
      writeFileSync(path.join(root, "src", "server.ts"), "export default null;\n", "utf8");
      writeFileSync(path.join(root, "src", "server", "index.ts"), "export default null;\n", "utf8");

      expect(discoverServerEntry(root)).resolves.toBe("src/server.ts");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("falls back to src/server/index.ts when src/server.ts is absent", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-"));

    try {
      mkdirSync(path.join(root, "src", "server"), { recursive: true });
      writeFileSync(path.join(root, "src", "server", "index.ts"), "export default null;\n", "utf8");

      expect(discoverServerEntry(root)).resolves.toBe("src/server/index.ts");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("rewrites bundled export lists into a local server handler binding", () => {
    const transformed = transformServerModuleSource(`
const helper = 1;
const server_default = createServer();
export { helper, server_default as default };
`);

    expect(transformed.source).toContain("export { helper };");
    expect(transformed.source).toContain("const __litzjsServerHandler = server_default;");
    expect(transformed.source).not.toContain("server_default as default");
    expect(transformed.handlerName).toBe("__litzjsServerHandler");
  });

  test("rewrites export default expressions into a local server handler binding", () => {
    const transformed = transformServerModuleSource(`
const helper = 1;
export default createServer({ helper });
`);

    expect(transformed.source).toContain("const __litzjsServerHandler = createServer({ helper });");
    expect(transformed.source).not.toContain("export default createServer");
    expect(transformed.handlerName).toBe("__litzjsServerHandler");
  });
});

function createMockViteDevServer(
  ssrLoadModuleImpl: (id: string) => Promise<Record<string, unknown>>,
): ViteDevServer {
  return {
    config: { root: "/fake-root" },
    ssrFixStacktrace: mock(() => {}),
    ssrLoadModule: ssrLoadModuleImpl,
    environments: {
      rsc: {
        pluginContainer: {
          resolveId: ssrLoadModuleImpl,
        },
        runner: {
          import: ssrLoadModuleImpl,
        },
      },
    },
  } as unknown as ViteDevServer;
}

function createMockRequest(options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const stream = new PassThrough();

  if (options.body) {
    stream.end(Buffer.from(options.body));
  } else {
    stream.end();
  }

  Object.assign(stream, {
    url: options.url,
    method: options.method,
    headers: {
      host: "localhost:5173",
      ...options.headers,
    },
    socket: { encrypted: false },
    connection: { encrypted: false },
  });

  return stream as unknown as IncomingMessage;
}

function createMockResponse(): ServerResponse & { getBody(): string } {
  let body = "";
  let statusCode = 200;
  const headers: Record<string, string> = {};

  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader(key: string, value: string) {
      headers[key] = value;
    },
    write(data?: string | Buffer) {
      if (data) {
        body += typeof data === "string" ? data : data.toString();
      }
    },
    end(data?: string) {
      if (data) {
        body += data;
      }
    },
    getBody() {
      return body;
    },
  } as unknown as ServerResponse & { getBody(): string };
}

describe("dev server abort signal lifecycle", () => {
  test("resource handler signal aborts when client disconnects", async () => {
    let capturedSignal: AbortSignal | undefined;
    const server = createMockViteDevServer(async () => ({
      resource: {
        async loader({ signal }: { signal: AbortSignal }) {
          capturedSignal = signal;
          return { data: "ok" };
        },
      },
    }));
    const internalMetadata = JSON.stringify({
      path: "/resources/config",
      operation: "loader",
      request: {},
    });
    const request = createMockRequest({
      url: "/_litzjs/resource",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: internalMetadata,
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzResourceRequest(
      server,
      [
        {
          path: "/resources/config",
          modulePath: "src/resources/config.ts",
          hasLoader: true,
          hasAction: false,
          hasComponent: false,
        },
      ],
      request,
      response,
      next,
    );

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    (request as unknown as PassThrough).emit("close");

    expect(capturedSignal!.aborted).toBe(true);
  });

  test("route handler signal aborts when client disconnects", async () => {
    let capturedSignal: AbortSignal | undefined;
    const server = createMockViteDevServer(async () => ({
      route: {
        async loader({ signal }: { signal: AbortSignal }) {
          capturedSignal = signal;
          return { data: "ok" };
        },
      },
    }));
    const internalMetadata = JSON.stringify({
      path: "/secrets/:id",
      target: "secrets.show",
      operation: "loader",
      request: { params: { id: "1" } },
    });
    const request = createMockRequest({
      url: "/_litzjs/route",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: internalMetadata,
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzRouteRequest(
      server,
      [{ id: "secrets.show", path: "/secrets/:id", modulePath: "src/routes/secrets.ts" }],
      request,
      response,
      next,
    );

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    (request as unknown as PassThrough).emit("close");

    expect(capturedSignal!.aborted).toBe(true);
  });

  test("API handler signal aborts when client disconnects", async () => {
    let capturedSignal: AbortSignal | undefined;
    const server = createMockViteDevServer(async () => ({
      api: {
        methods: {
          GET: async ({ signal }: { signal: AbortSignal }) => {
            capturedSignal = signal;
            return new Response("ok");
          },
        },
      },
    }));
    const request = createMockRequest({
      url: "/api/test",
      method: "GET",
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzApiRequest(
      server,
      [{ path: "/api/test", modulePath: "src/api/test.ts" }],
      request,
      response,
      next,
    );

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    (request as unknown as PassThrough).emit("close");

    expect(capturedSignal!.aborted).toBe(true);
  });
});

describe("dev server error masking", () => {
  test("does not expose raw error messages from resource handlers", async () => {
    const sensitiveMessage = "ECONNREFUSED 127.0.0.1:5432 - password=hunter2";
    const server = createMockViteDevServer(async () => {
      throw new Error(sensitiveMessage);
    });
    const internalMetadata = JSON.stringify({
      path: "/resources/config",
      operation: "loader",
      request: {},
    });
    const request = createMockRequest({
      url: "/_litzjs/resource",
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: internalMetadata,
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzResourceRequest(
      server,
      [
        {
          path: "/resources/config",
          modulePath: "src/resources/config.ts",
          hasLoader: true,
          hasAction: false,
          hasComponent: false,
        },
      ],
      request,
      response,
      next,
    );

    expect(response.statusCode).toBe(500);
    expect(response.getBody()).not.toContain(sensitiveMessage);
    expect(response.getBody()).not.toContain("hunter2");
    expect(response.getBody()).toContain("Resource request failed.");
  });

  test("does not expose raw error messages from route handlers", async () => {
    const sensitiveMessage = "SELECT * FROM users WHERE admin_token='xyz789'";
    const server = createMockViteDevServer(async () => {
      throw new Error(sensitiveMessage);
    });
    const internalMetadata = JSON.stringify({
      path: "/secrets/:id",
      target: "secrets.show",
      operation: "loader",
      request: { params: { id: "1" } },
    });
    const request = createMockRequest({
      url: "/_litzjs/route",
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: internalMetadata,
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzRouteRequest(
      server,
      [{ id: "secrets.show", path: "/secrets/:id", modulePath: "src/routes/secrets.ts" }],
      request,
      response,
      next,
    );

    expect(response.statusCode).toBe(500);
    expect(response.getBody()).not.toContain(sensitiveMessage);
    expect(response.getBody()).not.toContain("xyz789");
    expect(response.getBody()).toContain("Route request failed.");
  });

  test("does not expose raw error messages from API route handlers", async () => {
    const sensitiveMessage = "Redis auth failed: redis://:s3cret@10.0.0.1:6379";
    const server = createMockViteDevServer(async () => {
      throw new Error(sensitiveMessage);
    });
    const request = createMockRequest({
      url: "/api/private",
      method: "GET",
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzApiRequest(
      server,
      [{ path: "/api/private", modulePath: "src/api/private.ts" }],
      request,
      response,
      next,
    );

    expect(response.statusCode).toBe(500);
    expect(response.getBody()).not.toContain(sensitiveMessage);
    expect(response.getBody()).not.toContain("s3cret");
    expect(response.getBody()).toContain("API route failed.");
  });
});
