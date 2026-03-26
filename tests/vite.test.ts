import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";

import { describe, expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import {
  cleanupRscPluginArtifacts,
  discoverAllManifests,
  discoverApiRouteFromFile,
  discoverLayoutFromFile,
  discoverResourceFromFile,
  discoverRouteFromFile,
  discoverServerEntry,
  handleLitzApiRequest,
  handleLitzResourceRequest,
  handleLitzRouteRequest,
  transformServerModuleSource,
} from "../src/vite";

describe("vite production server helpers", () => {
  test("build completes without warnings", () => {
    const repoRoot = process.cwd();
    const build = spawnSync(process.execPath, ["run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60_000,
    });

    if (build.status !== 0) {
      throw new Error(
        ["package build failed", build.stdout, build.stderr].filter(Boolean).join("\n\n"),
      );
    }

    const buildOutput = [build.stdout, build.stderr].filter(Boolean).join("\n");

    expect(buildOutput).not.toContain("Warning:");
  }, 65000);

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

  test("removes __vite_rsc_ files but preserves other entries", () => {
    const serverOutDir = mkdtempSync(path.join(tmpdir(), "litz-server-cleanup-"));

    try {
      writeFileSync(path.join(serverOutDir, "index.js"), "export default handler;\n", "utf8");
      writeFileSync(
        path.join(serverOutDir, "__vite_rsc_assets_manifest.js"),
        "export default {};\n",
        "utf8",
      );
      writeFileSync(
        path.join(serverOutDir, "__vite_rsc_encryption_key.js"),
        "export default '';\n",
        "utf8",
      );
      writeFileSync(
        path.join(serverOutDir, "__vite_rsc_env_imports_entry_fallback.js"),
        "// fallback\n",
        "utf8",
      );

      cleanupRscPluginArtifacts(serverOutDir);

      const remaining = readdirSync(serverOutDir).sort();
      expect(remaining).toEqual(["index.js"]);
      expect(existsSync(path.join(serverOutDir, "__vite_rsc_assets_manifest.js"))).toBe(false);
      expect(existsSync(path.join(serverOutDir, "__vite_rsc_encryption_key.js"))).toBe(false);
    } finally {
      rmSync(serverOutDir, { force: true, recursive: true });
    }
  });

  test("emits route-scoped CSS assets for lazy route entries", () => {
    const repoRoot = process.cwd();
    const sourceFixtureRoot = path.join(repoRoot, "fixtures", "rsc-smoke");
    const root = mkdtempSync(path.join(repoRoot, "fixtures", ".tmp-rsc-smoke-css-"));

    try {
      cpSync(path.join(sourceFixtureRoot, "."), root, { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "home.css"),
        ".home { color: red; }\n",
        "utf8",
      );
      writeFileSync(
        path.join(root, "src", "routes", "features", "loader-data.css"),
        ".loader-css { color: blue; }\n",
        "utf8",
      );
      const indexRoutePath = path.join(root, "src", "routes", "index.tsx");
      const injectedIndexRouteSource = readFileSync(indexRoutePath, "utf8").replace(
        'import { defineRoute } from "litzjs";',
        'import "./home.css";\nimport { defineRoute } from "litzjs";',
      );

      if (!injectedIndexRouteSource.includes('import "./home.css";')) {
        throw new Error("CSS injection into the index route fixture failed.");
      }

      writeFileSync(indexRoutePath, injectedIndexRouteSource, "utf8");

      const loaderDataRoutePath = path.join(root, "src", "routes", "features", "loader-data.tsx");
      const injectedLoaderDataRouteSource = readFileSync(loaderDataRoutePath, "utf8").replace(
        'import { data, defineRoute, server } from "litzjs";',
        'import "./loader-data.css";\nimport { data, defineRoute, server } from "litzjs";',
      );

      if (!injectedLoaderDataRouteSource.includes('import "./loader-data.css";')) {
        throw new Error("CSS injection into the loader-data route fixture failed.");
      }

      writeFileSync(loaderDataRoutePath, injectedLoaderDataRouteSource, "utf8");

      const build = spawnSync(
        process.execPath,
        ["x", "vite", "build", "--config", path.join(root, "vite.config.ts")],
        {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: 55_000,
        },
      );

      if (build.status !== 0) {
        throw new Error(
          ["vite build failed", build.stdout, build.stderr].filter(Boolean).join("\n\n"),
        );
      }

      const manifest = JSON.parse(
        readFileSync(path.join(root, "dist", "client", ".vite", "manifest.json"), "utf8"),
      ) as Record<string, { css?: string[] }>;

      expect(manifest["../../virtual:litzjs:browser-entry"]?.css).toBeUndefined();
      expect(manifest["src/routes/index.tsx"]?.css).toHaveLength(1);
      expect(manifest["src/routes/features/loader-data.tsx"]?.css).toHaveLength(1);
      expect(manifest["src/routes/index.tsx"]?.css?.[0]).not.toBe(
        manifest["src/routes/features/loader-data.tsx"]?.css?.[0],
      );

      const clientAssets = readdirSync(path.join(root, "dist", "client", "assets")).sort();

      expect(clientAssets.some((file) => /^routes-.*\.css$/.test(file))).toBe(true);
      expect(clientAssets.some((file) => /^loader-data-.*\.css$/.test(file))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
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

describe("manifest discovery", () => {
  function createTempProject() {
    const root = mkdtempSync(path.join(tmpdir(), "litz-manifest-"));

    mkdirSync(path.join(root, "src", "routes", "api"), { recursive: true });
    mkdirSync(path.join(root, "src", "routes", "resources"), { recursive: true });

    return root;
  }

  describe("discoverRouteFromFile", () => {
    test("discovers a route definition from a file", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "home.tsx");

        writeFileSync(
          file,
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/home", { component: Home });`,
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toEqual({
          id: "/home",
          path: "/home",
          modulePath: "src/routes/home.tsx",
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("returns null for a file without a route definition", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "utils.ts");

        writeFileSync(file, `export function helper() { return 42; }`);

        const result = await discoverRouteFromFile(root, file);

        expect(result).toBeNull();
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });
  });

  describe("discoverLayoutFromFile", () => {
    test("discovers a layout definition from a file", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "layout.tsx");

        writeFileSync(
          file,
          `import { defineLayout } from "litzjs";\nexport const layout = defineLayout("/app", { component: AppLayout });`,
        );

        const result = await discoverLayoutFromFile(root, file);

        expect(result).toEqual({
          id: "/app",
          path: "/app",
          modulePath: "src/routes/layout.tsx",
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("returns null for a file without a layout definition", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "home.tsx");

        writeFileSync(
          file,
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/home", {});`,
        );

        const result = await discoverLayoutFromFile(root, file);

        expect(result).toBeNull();
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });
  });

  describe("discoverResourceFromFile", () => {
    test("discovers a resource with loader, action, and component", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "resources", "summary.ts");

        writeFileSync(
          file,
          `import { defineResource } from "litzjs";\nexport const resource = defineResource("/resource/summary", {\n  loader: async () => {},\n  action: async () => {},\n  component: Summary,\n});`,
        );

        const result = await discoverResourceFromFile(root, file);

        expect(result).toEqual({
          path: "/resource/summary",
          modulePath: "src/routes/resources/summary.ts",
          hasLoader: true,
          hasAction: true,
          hasComponent: true,
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("detects resource with only a loader", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "resources", "data.ts");

        writeFileSync(
          file,
          `import { defineResource } from "litzjs";\nexport const resource = defineResource("/resource/data", {\n  loader: async () => {},\n});`,
        );

        const result = await discoverResourceFromFile(root, file);

        expect(result).toEqual({
          path: "/resource/data",
          modulePath: "src/routes/resources/data.ts",
          hasLoader: true,
          hasAction: false,
          hasComponent: false,
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });
  });

  describe("discoverApiRouteFromFile", () => {
    test("discovers an API route definition", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "api", "health.ts");

        writeFileSync(
          file,
          `import { defineApiRoute } from "litzjs";\nexport const api = defineApiRoute("/api/health", { GET() { return Response.json({ ok: true }); } });`,
        );

        const result = await discoverApiRouteFromFile(root, file);

        expect(result).toEqual({
          path: "/api/health",
          modulePath: "src/routes/api/health.ts",
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("returns null for a file without an API route definition", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "api", "helpers.ts");

        writeFileSync(file, `export function validateToken(token: string) { return true; }`);

        const result = await discoverApiRouteFromFile(root, file);

        expect(result).toBeNull();
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });
  });

  describe("discoverAllManifests", () => {
    test("discovers routes, layouts, resources, and API routes from glob patterns", async () => {
      const root = createTempProject();

      try {
        writeFileSync(
          path.join(root, "src", "routes", "home.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/", { component: Home });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "about.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/about", { component: About });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "layout.tsx"),
          `import { defineLayout } from "litzjs";\nexport const layout = defineLayout("/app", { component: AppLayout });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "resources", "data.ts"),
          `import { defineResource } from "litzjs";\nexport const resource = defineResource("/resource/data", { loader: async () => {} });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "api", "health.ts"),
          `import { defineApiRoute } from "litzjs";\nexport const api = defineApiRoute("/api/health", { GET() { return Response.json({ ok: true }); } });`,
        );

        const result = await discoverAllManifests(
          root,
          [
            "src/routes/**/*.{ts,tsx}",
            "!src/routes/api/**/*.{ts,tsx}",
            "!src/routes/resources/**/*.{ts,tsx}",
          ],
          ["src/routes/resources/**/*.{ts,tsx}"],
          ["src/routes/api/**/*.{ts,tsx}"],
        );

        expect(result.routeManifest).toHaveLength(2);
        expect(result.routeManifest.map((r) => r.path).sort()).toEqual(["/", "/about"]);
        expect(result.layoutManifest).toHaveLength(1);
        expect(result.layoutManifest[0]?.path).toBe("/app");
        expect(result.resourceManifest).toHaveLength(1);
        expect(result.resourceManifest[0]?.path).toBe("/resource/data");
        expect(result.apiManifest).toHaveLength(1);
        expect(result.apiManifest[0]?.path).toBe("/api/health");
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("ignores files that do not match any manifest pattern", async () => {
      const root = createTempProject();

      try {
        writeFileSync(
          path.join(root, "src", "routes", "utils.ts"),
          `export function helper() { return 42; }`,
        );

        const result = await discoverAllManifests(
          root,
          [
            "src/routes/**/*.{ts,tsx}",
            "!src/routes/api/**/*.{ts,tsx}",
            "!src/routes/resources/**/*.{ts,tsx}",
          ],
          ["src/routes/resources/**/*.{ts,tsx}"],
          ["src/routes/api/**/*.{ts,tsx}"],
        );

        expect(result.routeManifest).toHaveLength(0);
        expect(result.layoutManifest).toHaveLength(0);
        expect(result.resourceManifest).toHaveLength(0);
        expect(result.apiManifest).toHaveLength(0);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("sorts routes by path specificity", async () => {
      const root = createTempProject();

      try {
        writeFileSync(
          path.join(root, "src", "routes", "catch-all.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/*", { component: CatchAll });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "home.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/", { component: Home });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "about.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/about", { component: About });`,
        );

        const result = await discoverAllManifests(
          root,
          [
            "src/routes/**/*.{ts,tsx}",
            "!src/routes/api/**/*.{ts,tsx}",
            "!src/routes/resources/**/*.{ts,tsx}",
          ],
          ["src/routes/resources/**/*.{ts,tsx}"],
          ["src/routes/api/**/*.{ts,tsx}"],
        );

        const paths = result.routeManifest.map((r) => r.path);
        const catchAllIdx = paths.indexOf("/*");
        const aboutIdx = paths.indexOf("/about");

        expect(aboutIdx).toBeLessThan(catchAllIdx);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });
  });
});
