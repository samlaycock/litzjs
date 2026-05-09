import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

import { describe, expect, mock, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
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
  buildLitzApp,
  discoverAllManifests,
  discoverApiRouteFromFile,
  discoverLayoutFromFile,
  discoverResourceFromFile,
  discoverRouteFromFile,
  discoverServerEntry,
  handleLitzApiRequest,
  handleLitzDocumentRequest,
  handleLitzResourceRequest,
  handleLitzRouteRequest,
  litz,
} from "../src/vite";
import { litzNitro } from "../src/vite-nitro";

async function waitForHttpOk(
  url: string,
  serverProcess: ChildProcessWithoutNullStreams,
): Promise<void> {
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];

  serverProcess.stderr.on("data", (chunk) => stderrChunks.push(String(chunk)));
  serverProcess.stdout.on("data", (chunk) => stdoutChunks.push(String(chunk)));

  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < 10_000) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        [
          `Smoke server exited with code ${serverProcess.exitCode}.`,
          stdoutChunks.join(""),
          stderrChunks.join(""),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }

      lastError = new Error(`Received ${response.status} from ${url}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    [
      `Timed out waiting for smoke server at ${url}.`,
      lastError instanceof Error ? lastError.message : String(lastError),
      stdoutChunks.join(""),
      stderrChunks.join(""),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function waitForProcessExit(serverProcess: ChildProcessWithoutNullStreams): Promise<void> {
  if (serverProcess.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);

    serverProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

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

  test("keeps Nitro out of the core litz plugin path", () => {
    const plugins = litz() as Plugin[];

    expect(plugins.some((plugin) => plugin.name.startsWith("nitro"))).toBe(false);
    expect(plugins.some((plugin) => plugin.name === "litzjs/nitro")).toBe(false);
  });

  test("normalizes generated Nitro renderer import paths before embedding them", async () => {
    const previousCwd = process.cwd();
    const projectRoot = mkdtempSync(path.join(tmpdir(), "litz\\nitro-workspace-"));
    const rendererPath = path.join(projectRoot, ".litzjs", "nitro-renderer.ts");

    try {
      mkdirSync(path.join(projectRoot, "src"), { recursive: true });
      writeFileSync(path.join(projectRoot, "src", "main.tsx"), "export {};\n", "utf8");
      writeFileSync(path.join(projectRoot, "src", "server.ts"), "export default null;\n", "utf8");
      process.chdir(projectRoot);

      const plugin = (litzNitro() as Plugin[]).find(
        (candidate) => candidate.name === "litzjs/nitro",
      );

      if (!plugin?.configResolved) {
        throw new Error("Expected litzjs/nitro configResolved hook to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;

      await configResolved.call(
        {} as never,
        {
          root: projectRoot,
          base: "/",
          command: "serve",
          build: {
            outDir: "dist",
          },
          environments: {
            client: {
              build: {
                outDir: path.join("dist", "client"),
              },
            },
            rsc: {
              build: {
                outDir: path.join("dist", "server"),
                rollupOptions: {
                  output: {
                    codeSplitting: false,
                  },
                },
              },
            },
          },
        } as never,
      );

      const rendererSource = readFileSync(rendererPath, "utf8");

      expect(existsSync(rendererPath)).toBe(true);
      expect(rendererSource).toContain(
        path.resolve(projectRoot, "src", "server.ts").replaceAll("\\", "/"),
      );
      expect(rendererSource).not.toContain("\\");
    } finally {
      process.chdir(previousCwd);
      rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  test("writes the production Nitro renderer to the path captured before Vite root resolves", async () => {
    const workspaceRoot = process.cwd();
    const root = mkdtempSync(path.join(tmpdir(), "litz-nitro-root-"));
    const rendererPath = path.join(workspaceRoot, ".litzjs", "nitro-renderer.ts");
    const previousRendererSource = existsSync(rendererPath)
      ? readFileSync(rendererPath, "utf8")
      : null;

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "server.ts"), "export default null;\n", "utf8");

      const plugin = (litzNitro() as Plugin[]).find(
        (candidate) => candidate.name === "litzjs/nitro",
      );

      if (!plugin?.configResolved) {
        throw new Error("Expected litzjs/nitro configResolved hook to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;

      await configResolved.call(
        {} as never,
        {
          root,
          base: "/",
          command: "build",
          build: {
            outDir: "dist",
          },
          environments: {
            rsc: {
              build: {
                outDir: path.join("dist", "rsc"),
              },
            },
          },
        } as never,
      );

      const rendererSource = readFileSync(rendererPath, "utf8");

      expect(rendererSource).toContain(path.resolve(root, "dist", "rsc", "index.js"));
      expect(rendererSource).not.toContain("Not ready");
      expect(rendererSource).not.toContain(path.resolve(root, "src", "server.ts"));
    } finally {
      if (previousRendererSource === null) {
        rmSync(rendererPath, { force: true });
      } else {
        writeFileSync(rendererPath, previousRendererSource, "utf8");
      }

      rmSync(root, { force: true, recursive: true });
    }
  });

  test("fails fast when litzNitro cannot discover a server entry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-nitro-missing-server-"));

    try {
      mkdirSync(path.join(root, "app", "server"), { recursive: true });
      writeFileSync(path.join(root, "app", "server", "entry.ts"), "export default null;\n", "utf8");

      const plugin = (litzNitro() as Plugin[]).find(
        (candidate) => candidate.name === "litzjs/nitro",
      );

      if (!plugin?.configResolved) {
        throw new Error("Expected litzjs/nitro configResolved hook to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      let error: unknown;

      try {
        await configResolved.call(
          {} as never,
          {
            root,
            base: "/",
            command: "serve",
            build: {
              outDir: "dist",
            },
            environments: {},
          } as never,
        );
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("litzNitro() could not find a server entry");
      expect((error as Error).message).toContain('litzNitro({ server: "..." })');
    } finally {
      rmSync(root, { force: true, recursive: true });
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

      const publicAssets = readdirSync(path.join(root, ".output", "public", "assets")).sort();

      expect(publicAssets.some((file) => /^routes-.*\.css$/.test(file))).toBe(true);
      expect(publicAssets.some((file) => /^loader-data-.*\.css$/.test(file))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  test("keeps only Nitro final outputs after a production build", () => {
    const repoRoot = process.cwd();
    const sourceFixtureRoot = path.join(repoRoot, "fixtures", "rsc-smoke");
    const root = mkdtempSync(path.join(repoRoot, "fixtures", ".tmp-rsc-smoke-clean-"));

    try {
      cpSync(path.join(sourceFixtureRoot, "."), root, { recursive: true });

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

      expect(existsSync(path.join(root, ".output", "public"))).toBe(true);
      expect(existsSync(path.join(root, ".output", "server"))).toBe(true);
      expect(existsSync(path.join(root, "dist"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  test("programmatic build helper completes and leaves only Nitro final outputs", async () => {
    const repoRoot = process.cwd();
    const sourceFixtureRoot = path.join(repoRoot, "fixtures", "rsc-smoke");
    const root = mkdtempSync(path.join(repoRoot, "fixtures", ".tmp-rsc-smoke-build-app-"));

    try {
      cpSync(path.join(sourceFixtureRoot, "."), root, { recursive: true });

      await buildLitzApp({
        configFile: path.join(root, "vite.config.ts"),
        root,
      });

      expect(existsSync(path.join(root, ".output", "public"))).toBe(true);
      expect(existsSync(path.join(root, ".output", "server"))).toBe(true);
      expect(existsSync(path.join(root, "dist"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  test("built smoke fixture serves document and API routes", async () => {
    const repoRoot = process.cwd();
    const sourceFixtureRoot = path.join(repoRoot, "fixtures", "rsc-smoke");
    const root = mkdtempSync(path.join(repoRoot, "fixtures", ".tmp-rsc-smoke-runtime-"));
    const port = 4300 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://127.0.0.1:${port}`;
    let serverProcess: ChildProcessWithoutNullStreams | undefined;

    try {
      cpSync(path.join(sourceFixtureRoot, "."), root, { recursive: true });

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

      serverProcess = spawn(process.execPath, [path.join(root, ".output", "server", "index.mjs")], {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(port),
        },
      });

      await waitForHttpOk(`${baseUrl}/api/health`, serverProcess);

      const rootResponse = await fetch(`${baseUrl}/`);
      const featureResponse = await fetch(`${baseUrl}/features/loader-data`);
      const apiResponse = await fetch(`${baseUrl}/api/health`);
      const rootHtml = await rootResponse.text();
      const featureHtml = await featureResponse.text();
      const apiBody = (await apiResponse.json()) as { ok?: boolean; runtime?: string };

      expect(rootResponse.status).toBe(200);
      expect(rootResponse.headers.get("content-type")).toContain("text/html");
      expect(rootHtml).toContain('id="app"');
      expect(rootHtml).toContain('type="module"');

      expect(featureResponse.status).toBe(200);
      expect(featureResponse.headers.get("content-type")).toContain("text/html");
      expect(featureHtml).toContain('id="app"');

      expect(apiResponse.status).toBe(200);
      expect(apiBody).toEqual({ ok: true, runtime: "litz-fixture" });
    } finally {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
        await waitForProcessExit(serverProcess);
      }

      rmSync(root, { recursive: true, force: true });
    }
  }, 70000);
});

describe("dev server hot updates", () => {
  test("client route manifests include module files without unused hotLoad handlers", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-route-manifest-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "index.tsx"),
        'import { defineRoute } from "litzjs";\n\nexport const route = defineRoute("/", {\n  component() {\n    return null;\n  },\n});\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.resolveId || !plugin.load) {
        throw new Error("Expected litzjs/vite route-manifest hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const resolveId =
        typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
      const load = typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const resolvedId = resolveId.call(
        pluginContext,
        "virtual:litzjs:route-manifest",
        undefined,
        {} as never,
      );
      const manifestSource = load.call(
        {
          environment: {
            name: "client",
          },
        } as never,
        resolvedId as string,
        {} as never,
      );

      expect(manifestSource).toContain("moduleFile:");
      expect(manifestSource).not.toContain("hotLoad:");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("client route manifests import explicit client boundary modules without projection", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-route-client-boundary-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "index.tsx"),
        [
          'import { defineRoute } from "litzjs";',
          "",
          "export const route = defineRoute('/', {",
          "  loader: async () => ({ kind: 'data', data: { ok: true } }),",
          "  component() {",
          "    return null;",
          "  },",
          "});",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        path.join(root, "src", "routes", "index.client.tsx"),
        [
          'import { defineRoute } from "litzjs";',
          "",
          "export const route = defineRoute('/', {",
          "  component() {",
          "    return null;",
          "  },",
          "});",
        ].join("\n"),
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.resolveId || !plugin.load || !plugin.transform) {
        throw new Error("Expected litzjs/vite route-manifest and transform hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const resolveId =
        typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
      const load = typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
      const transform =
        typeof plugin.transform === "function" ? plugin.transform : plugin.transform.handler;
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const resolvedId = resolveId.call(
        pluginContext,
        "virtual:litzjs:route-manifest",
        undefined,
        {} as never,
      );
      const manifestSource = load.call(
        {
          environment: {
            name: "client",
          },
        } as never,
        resolvedId as string,
        {} as never,
      ) as string;
      const routeFile = path.join(root, "src", "routes", "index.tsx");
      const transformResult = await transform.call(
        {
          environment: {
            name: "client",
          },
        } as never,
        readFileSync(routeFile, "utf8"),
        routeFile,
      );

      expect(manifestSource).toContain("index.client.tsx");
      expect(manifestSource).not.toContain("index.tsx");
      expect(transformResult).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("dev watcher refreshes manifests when .jsx client boundary files are added", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-jsx-client-boundary-watch-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "profile.js"),
        [
          'import { defineRoute } from "litzjs";',
          "",
          "export const route = defineRoute('/profile', {",
          "  loader: async () => ({ kind: 'data', data: { ok: true } }),",
          "  component() {",
          "    return null;",
          "  },",
          "});",
        ].join("\n"),
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.configureServer || !plugin.resolveId || !plugin.load) {
        throw new Error("Expected litzjs/vite dev-server hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const configureServer =
        typeof plugin.configureServer === "function"
          ? plugin.configureServer
          : plugin.configureServer.handler;
      const resolveId =
        typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
      const load = typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
      const watcherHandlers = new Map<string, (file: string) => void>();
      const wsSend = mock(() => {});
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      await configureServer.call(pluginContext, {
        watcher: {
          on(event: string, handler: (file: string) => void) {
            watcherHandlers.set(event, handler);
          },
        },
        middlewares: {
          use() {},
        },
        moduleGraph: {
          getModuleById() {
            return undefined;
          },
          invalidateModule() {},
        },
        ws: {
          send: wsSend,
        },
      } as never);

      const resolvedId = resolveId.call(
        pluginContext,
        "virtual:litzjs:route-manifest",
        undefined,
        {} as never,
      );
      const loadClientManifest = () =>
        load.call(
          {
            environment: {
              name: "client",
            },
          } as never,
          resolvedId as string,
          {} as never,
        ) as string;

      expect(loadClientManifest()).toContain("profile.js");

      const clientBoundaryFile = path.join(root, "src", "routes", "profile.client.jsx");
      writeFileSync(
        clientBoundaryFile,
        [
          'import { defineRoute } from "litzjs";',
          "",
          "export const route = defineRoute('/profile', {",
          "  component() {",
          "    return null;",
          "  },",
          "});",
        ].join("\n"),
        "utf8",
      );

      watcherHandlers.get("add")?.(clientBoundaryFile);
      await new Promise((resolve) => setTimeout(resolve, 75));

      expect(loadClientManifest()).toContain("profile.client.jsx");
      expect(wsSend).toHaveBeenCalledWith({ type: "full-reload" });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("returns client modules for projected route updates in the client environment", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-hot-update-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "index.tsx"),
        'import { defineRoute } from "litzjs";\n\nexport const route = defineRoute("/", {\n  component() {\n    return null;\n  },\n});\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.hotUpdate) {
        throw new Error("Expected litzjs/vite hot-update hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const hotUpdate =
        typeof plugin.hotUpdate === "function" ? plugin.hotUpdate : plugin.hotUpdate.handler;
      const routeFile = path.join(root, "src", "routes", "index.tsx");
      const clientModule = {
        id: `/@fs/${routeFile.split(path.sep).join("/")}`,
      };
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const result = await hotUpdate.call(
        {
          environment: {
            name: "client",
            moduleGraph: {
              getModulesByFile(file: string) {
                return file === routeFile ? new Set([clientModule]) : undefined;
              },
              getModuleById(id: string) {
                return id === clientModule.id ? clientModule : undefined;
              },
            },
          },
        } as never,
        {
          type: "update",
          file: routeFile,
          modules: [clientModule] as never,
          timestamp: Date.now(),
          read: () => "",
          server: {} as never,
        },
      );

      expect(result).toHaveLength(1);
      expect(result?.[0]).toBe(clientModule as never);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("returns client modules for projected .jsx route updates in the client environment", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-hot-update-jsx-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "index.jsx"),
        'import { defineRoute } from "litzjs";\n\nexport const route = defineRoute("/", {\n  component() {\n    return null;\n  },\n});\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.hotUpdate) {
        throw new Error("Expected litzjs/vite hot-update hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const hotUpdate =
        typeof plugin.hotUpdate === "function" ? plugin.hotUpdate : plugin.hotUpdate.handler;
      const routeFile = path.join(root, "src", "routes", "index.jsx");
      const clientModule = {
        id: `/@fs/${routeFile.split(path.sep).join("/")}`,
      };
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const result = await hotUpdate.call(
        {
          environment: {
            name: "client",
            moduleGraph: {
              getModulesByFile(file: string) {
                return file === routeFile ? new Set([clientModule]) : undefined;
              },
              getModuleById(id: string) {
                return id === clientModule.id ? clientModule : undefined;
              },
            },
          },
        } as never,
        {
          type: "update",
          file: routeFile,
          modules: [clientModule] as never,
          timestamp: Date.now(),
          read: () => "",
          server: {} as never,
        },
      );

      expect(result).toHaveLength(1);
      expect(result?.[0]).toBe(clientModule as never);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("returns client modules for projected .js route updates in the client environment", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-hot-update-js-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "index.js"),
        'import { defineRoute } from "litzjs";\n\nexport const route = defineRoute("/", {\n  component() {\n    return null;\n  },\n});\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.hotUpdate) {
        throw new Error("Expected litzjs/vite hot-update hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const hotUpdate =
        typeof plugin.hotUpdate === "function" ? plugin.hotUpdate : plugin.hotUpdate.handler;
      const routeFile = path.join(root, "src", "routes", "index.js");
      const clientModule = {
        id: `/@fs/${routeFile.split(path.sep).join("/")}`,
      };
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const result = await hotUpdate.call(
        {
          environment: {
            name: "client",
            moduleGraph: {
              getModulesByFile(file: string) {
                return file === routeFile ? new Set([clientModule]) : undefined;
              },
              getModuleById(id: string) {
                return id === clientModule.id ? clientModule : undefined;
              },
            },
          },
        } as never,
        {
          type: "update",
          file: routeFile,
          modules: [clientModule] as never,
          timestamp: Date.now(),
          read: () => "",
          server: {} as never,
        },
      );

      expect(result).toHaveLength(1);
      expect(result?.[0]).toBe(clientModule as never);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("does not hijack projected route updates outside the client environment", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-hot-update-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "index.tsx"),
        'import { defineRoute } from "litzjs";\n\nexport const route = defineRoute("/", {\n  component() {\n    return null;\n  },\n});\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.hotUpdate) {
        throw new Error("Expected litzjs/vite hot-update hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const hotUpdate =
        typeof plugin.hotUpdate === "function" ? plugin.hotUpdate : plugin.hotUpdate.handler;
      const pluginContext = {} as never;
      const routeFile = path.join(root, "src", "routes", "index.tsx");

      await configResolved.call(pluginContext, {
        root,
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const result = await hotUpdate.call(
        {
          environment: {
            name: "rsc",
            moduleGraph: {
              getModulesByFile() {
                return new Set();
              },
            },
          },
        } as never,
        {
          type: "update",
          file: routeFile,
          modules: [],
          timestamp: Date.now(),
          read: () => "",
          server: {} as never,
        },
      );

      expect(result).toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("prefixes client route manifest imports with the configured base", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-route-manifest-base-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      mkdirSync(path.join(root, "src", "routes"), { recursive: true });
      writeFileSync(
        path.join(root, "src", "routes", "index.tsx"),
        'import { defineRoute } from "litzjs";\n\nexport const route = defineRoute("/", {\n  component() {\n    return null;\n  },\n});\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.resolveId || !plugin.load) {
        throw new Error("Expected litzjs/vite route-manifest hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const resolveId =
        typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
      const load = typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        base: "/app/",
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const resolvedId = resolveId.call(
        pluginContext,
        "virtual:litzjs:route-manifest",
        undefined,
        {} as never,
      );
      const manifestSource = load.call(
        {
          environment: {
            name: "client",
          },
        } as never,
        resolvedId as string,
        {} as never,
      ) as string;

      expect(manifestSource).toContain('import("/app/@fs/');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("exposes the configured base through a virtual module", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-base-module-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.resolveId || !plugin.load) {
        throw new Error("Expected litzjs/vite base virtual module hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const resolveId =
        typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
      const load = typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        base: "/app/",
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const resolvedId = resolveId.call(
        pluginContext,
        "virtual:litzjs:base",
        undefined,
        {} as never,
      );
      const baseSource = load.call(
        {
          environment: {
            name: "nitro",
          },
        } as never,
        resolvedId as string,
        {} as never,
      );

      expect(baseSource).toBe('export const base = "/app";');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("prefixes the generated browser entry import with the configured base", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-browser-entry-base-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.resolveId || !plugin.load) {
        throw new Error("Expected litzjs/vite browser-entry hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const resolveId =
        typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
      const load = typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        base: "/app/",
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const resolvedId = resolveId.call(
        pluginContext,
        "virtual:litzjs:browser-entry",
        undefined,
        {} as never,
      );
      const browserEntrySource = load.call(
        {
          environment: {
            name: "client",
          },
        } as never,
        resolvedId as string,
        {} as never,
      ) as string;

      expect(browserEntrySource).toContain('import "/app/@fs/');
      expect(browserEntrySource).toContain(
        'import { configureClientRuntime } from "litzjs/client";',
      );
      expect(browserEntrySource).toContain('baseUrl: "/app"');
      expect(browserEntrySource).not.toContain("__litzjsBaseUrl");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("uses the configured client entry for the generated browser entry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-browser-entry-client-entry-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "entry.tsx"), "export {};\n", "utf8");

      const plugin = (litz({ clientEntry: "src/entry.tsx" }) as Plugin[]).find(
        (candidate) => candidate.name === "litzjs/vite",
      );

      if (!plugin?.configResolved || !plugin.resolveId || !plugin.load) {
        throw new Error("Expected litzjs/vite browser-entry hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const resolveId =
        typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler;
      const load = typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
      const pluginContext = {} as never;

      await configResolved.call(pluginContext, {
        root,
        base: "/",
        command: "serve",
        build: {
          outDir: "dist",
        },
        environments: {
          client: {
            build: {
              outDir: path.join("dist", "client"),
            },
          },
          rsc: {
            build: {
              outDir: path.join("dist", "server"),
              rollupOptions: {
                output: {
                  codeSplitting: false,
                },
              },
            },
          },
        },
      } as never);

      const resolvedId = resolveId.call(
        pluginContext,
        "virtual:litzjs:browser-entry",
        undefined,
        {} as never,
      );
      const browserEntrySource = load.call(
        {
          environment: {
            name: "client",
          },
        } as never,
        resolvedId as string,
        {} as never,
      ) as string;

      expect(browserEntrySource).toContain(
        `/@fs/${path.join(root, "src", "entry.tsx").replaceAll("\\", "/")}`,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("does not inspect HTML module scripts when resolving the default browser entry", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-browser-entry-vite-html-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(
        path.join(root, "index.html"),
        '<!doctype html><html><body><script type="module">console.log("inline");</script></body></html>\n',
        "utf8",
      );
      writeFileSync(
        path.join(root, "admin.html"),
        '<!doctype html><html><body><script type="module" src="/src/admin.tsx"></script></body></html>\n',
        "utf8",
      );
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      writeFileSync(path.join(root, "src", "admin.tsx"), "export {};\n", "utf8");

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved) {
        throw new Error("Expected litzjs/vite configResolved hook to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;

      await configResolved.call(
        {} as never,
        {
          root,
          base: "/",
          command: "serve",
          build: {
            outDir: "dist",
          },
          environments: {
            client: {
              build: {
                outDir: path.join("dist", "client"),
              },
            },
            rsc: {
              build: {
                outDir: path.join("dist", "server"),
                rollupOptions: {
                  output: {
                    codeSplitting: false,
                  },
                },
              },
            },
          },
        } as never,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("leaves custom server entries unchanged so manifests are wired explicitly", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-explicit-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      writeFileSync(
        path.join(root, "src", "server.ts"),
        'import { createServer } from "litzjs/server";\nimport { base } from "virtual:litzjs:base";\nimport { serverManifest } from "virtual:litzjs:server-manifest";\n\nexport default createServer({ base, manifest: serverManifest });\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.transform) {
        throw new Error("Expected litzjs/vite transform hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const transform =
        typeof plugin.transform === "function" ? plugin.transform : plugin.transform.handler;
      const pluginContext = {
        environment: {
          name: "nitro",
        },
      } as never;

      await configResolved.call(
        {} as never,
        {
          root,
          base: "/app/",
          command: "serve",
          build: {
            outDir: "dist",
          },
          environments: {
            client: {
              build: {
                outDir: path.join("dist", "client"),
              },
            },
            rsc: {
              build: {
                outDir: path.join("dist", "server"),
                rollupOptions: {
                  output: {
                    codeSplitting: false,
                  },
                },
              },
            },
          },
        } as never,
      );

      const result = await transform.call(
        pluginContext,
        'import { createServer } from "litzjs/server";\nimport { base } from "virtual:litzjs:base";\nimport { serverManifest } from "virtual:litzjs:server-manifest";\n\nexport default createServer({ base, manifest: serverManifest });\n',
        path.join(root, "src", "server.ts"),
      );

      expect(result).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("leaves namespace createServer calls unchanged", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-ns-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      writeFileSync(
        path.join(root, "src", "server.ts"),
        'import * as litzServer from "litzjs/server";\n\nexport default litzServer.createServer();\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.transform) {
        throw new Error("Expected litzjs/vite transform hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const transform =
        typeof plugin.transform === "function" ? plugin.transform : plugin.transform.handler;
      const pluginContext = {
        environment: {
          name: "nitro",
        },
      } as never;

      await configResolved.call(
        {} as never,
        {
          root,
          base: "/",
          command: "serve",
          build: {
            outDir: "dist",
          },
          environments: {
            client: {
              build: {
                outDir: path.join("dist", "client"),
              },
            },
            rsc: {
              build: {
                outDir: path.join("dist", "server"),
                rollupOptions: {
                  output: {
                    codeSplitting: false,
                  },
                },
              },
            },
          },
        } as never,
      );

      const result = await transform.call(
        pluginContext,
        'import * as litzServer from "litzjs/server";\n\nexport default litzServer.createServer();\n',
        path.join(root, "src", "server.ts"),
      );

      expect(result).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("allows indirect createServer wrappers in custom server entries", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-indirect-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      writeFileSync(
        path.join(root, "src", "server.ts"),
        'import { createServer } from "litzjs/server";\nconst factory = createServer;\nexport default factory();\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.transform) {
        throw new Error("Expected litzjs/vite transform hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const transform =
        typeof plugin.transform === "function" ? plugin.transform : plugin.transform.handler;
      const pluginContext = {
        environment: {
          name: "nitro",
        },
      } as never;

      await configResolved.call(
        {} as never,
        {
          root,
          base: "/",
          command: "serve",
          build: {
            outDir: "dist",
          },
          environments: {
            client: {
              build: {
                outDir: path.join("dist", "client"),
              },
            },
            rsc: {
              build: {
                outDir: path.join("dist", "server"),
                rollupOptions: {
                  output: {
                    codeSplitting: false,
                  },
                },
              },
            },
          },
        } as never,
      );

      const result = await transform.call(
        pluginContext,
        'import { createServer } from "litzjs/server";\nconst factory = createServer;\nexport default factory();\n',
        path.join(root, "src", "server.ts"),
      );

      expect(result).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("leaves namespace imports without createServer calls unchanged", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-server-entry-ns-no-cs-"));

    try {
      mkdirSync(path.join(root, "src"), { recursive: true });
      writeFileSync(path.join(root, "src", "main.tsx"), "export {};\n", "utf8");
      writeFileSync(
        path.join(root, "src", "server.ts"),
        'import * as litz from "litzjs/server";\nexport const mw = litz.defineMiddleware();\n',
        "utf8",
      );

      const plugin = (litz() as Plugin[]).find((candidate) => candidate.name === "litzjs/vite");

      if (!plugin?.configResolved || !plugin.transform) {
        throw new Error("Expected litzjs/vite transform hooks to be available.");
      }

      const configResolved =
        typeof plugin.configResolved === "function"
          ? plugin.configResolved
          : plugin.configResolved.handler;
      const transform =
        typeof plugin.transform === "function" ? plugin.transform : plugin.transform.handler;
      const pluginContext = {
        environment: {
          name: "nitro",
        },
      } as never;

      await configResolved.call(
        {} as never,
        {
          root,
          base: "/",
          command: "serve",
          build: {
            outDir: "dist",
          },
          environments: {
            client: {
              build: {
                outDir: path.join("dist", "client"),
              },
            },
            rsc: {
              build: {
                outDir: path.join("dist", "server"),
                rollupOptions: {
                  output: {
                    codeSplitting: false,
                  },
                },
              },
            },
          },
        } as never,
      );

      const result = await transform.call(
        pluginContext,
        'import * as litz from "litzjs/server";\nexport const mw = litz.defineMiddleware();\n',
        path.join(root, "src", "server.ts"),
      );

      expect(result).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

function createMockViteDevServer(
  ssrLoadModuleImpl: (id: string) => Promise<Record<string, unknown>>,
): ViteDevServer {
  return {
    config: { root: "/fake-root" },
    ssrFixStacktrace: mock(() => {}),
    ssrLoadModule: ssrLoadModuleImpl,
    transformIndexHtml: mock(async (_url: string, template: string) => template),
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

describe("document entry resolution", () => {
  test("calls next for explicit MPA HTML paths so Vite can serve them", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-document-vite-mpa-"));

    try {
      mkdirSync(path.join(root, "about", "team"), { recursive: true });
      writeFileSync(
        path.join(root, "about", "team", "index.html"),
        "<html><body>team index</body></html>\n",
        "utf8",
      );
      writeFileSync(
        path.join(root, "about", "team", "foo.html"),
        "<html><body>team foo</body></html>\n",
        "utf8",
      );

      const server = {
        ...createMockViteDevServer(async () => ({})),
        config: { root },
      } as ViteDevServer;
      const request = createMockRequest({
        url: "/about/team/foo",
        method: "GET",
        headers: { accept: "text/html" },
      });
      const response = createMockResponse();
      const next = mock((error?: unknown) => {
        void error;
      });

      await handleLitzDocumentRequest(server, request, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0]?.[0]).toBeUndefined();
      expect(response.getBody()).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("serves index.html for unmatched HTML routes when an index entry exists", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-document-index-fallback-"));

    try {
      writeFileSync(path.join(root, "index.html"), "<html><body>index</body></html>\n", "utf8");
      writeFileSync(path.join(root, "about.html"), "<html><body>about</body></html>\n", "utf8");

      const server = {
        ...createMockViteDevServer(async () => ({})),
        config: { root },
      } as ViteDevServer;
      const request = createMockRequest({
        url: "/missing",
        method: "GET",
        headers: { accept: "text/html" },
      });
      const response = createMockResponse();
      const next = mock(() => {});

      await handleLitzDocumentRequest(server, request, response, next);

      expect(response.statusCode).toBe(200);
      expect(response.getBody()).toContain("index");
      expect(next).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("serves index.html for the root document route", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-document-root-"));

    try {
      writeFileSync(
        path.join(root, "index.html"),
        "<html><body>root index</body></html>\n",
        "utf8",
      );

      const server = {
        ...createMockViteDevServer(async () => ({})),
        config: { root },
      } as ViteDevServer;
      const request = createMockRequest({
        url: "/",
        method: "GET",
        headers: { accept: "text/html" },
      });
      const response = createMockResponse();
      const next = mock(() => {});

      await handleLitzDocumentRequest(server, request, response, next);

      expect(response.statusCode).toBe(200);
      expect(response.getBody()).toContain("root index");
      expect(next).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("calls next for unmatched HTML routes when no index entry exists", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "litz-document-no-index-fallback-"));

    try {
      writeFileSync(path.join(root, "about.html"), "<html><body>about</body></html>\n", "utf8");
      writeFileSync(path.join(root, "contact.html"), "<html><body>contact</body></html>\n", "utf8");

      const server = {
        ...createMockViteDevServer(async () => ({})),
        config: { root },
      } as ViteDevServer;
      const request = createMockRequest({
        url: "/missing",
        method: "GET",
        headers: { accept: "text/html" },
      });
      const response = createMockResponse();
      const next = mock(() => {});

      await handleLitzDocumentRequest(server, request, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.getBody()).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("dev server abort signal lifecycle", () => {
  test("matches base-prefixed internal resource requests", async () => {
    let capturedHref = "";
    const server = createMockViteDevServer(async () => ({
      resource: {
        async loader({ request }: { request: Request }) {
          capturedHref = request.url;
          return {
            kind: "data",
            data: { ok: true },
          };
        },
      },
    }));
    const request = createMockRequest({
      url: "/app/_litzjs/resource",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "/resources/config",
        operation: "loader",
        request: {},
      }),
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
      "/app/",
    );

    expect(response.statusCode).toBe(200);
    expect(capturedHref).toBe("http://localhost:5173/resources/config");
  });

  test("matches base-prefixed internal route requests", async () => {
    let capturedHref = "";
    const server = createMockViteDevServer(async () => ({
      route: {
        async loader({ request }: { request: Request }) {
          capturedHref = request.url;
          return {
            kind: "data",
            data: { ok: true },
          };
        },
      },
    }));
    const request = createMockRequest({
      url: "/app/_litzjs/route",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "/projects/:id",
        target: "projects.show",
        operation: "loader",
        request: {
          params: { id: "42" },
        },
      }),
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzRouteRequest(
      server,
      [{ id: "projects.show", path: "/projects/:id", modulePath: "src/routes/projects.ts" }],
      request,
      response,
      next,
      "/app/",
    );

    expect(response.statusCode).toBe(200);
    expect(capturedHref).toBe("http://localhost:5173/projects/42");
  });

  test("matches base-prefixed API requests", async () => {
    let capturedHref = "";
    const server = createMockViteDevServer(async () => ({
      api: {
        methods: {
          GET({ request }: { request: Request }) {
            capturedHref = request.url;
            return new Response("ok");
          },
        },
      },
    }));
    const request = createMockRequest({
      url: "/app/api/test",
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
      "/app/",
    );

    expect(response.statusCode).toBe(200);
    expect(response.getBody()).toBe("ok");
    expect(capturedHref).toBe("http://litzjs.local/app/api/test");
  });

  test("rebuilds repeated query params for internal resource requests", async () => {
    let capturedTags: string[] = [];
    let capturedHref = "";
    const server = createMockViteDevServer(async () => ({
      resource: {
        async loader({ request }: { request: Request }) {
          const url = new URL(request.url);
          capturedHref = request.url;
          capturedTags = url.searchParams.getAll("tag");

          return {
            kind: "data",
            data: {
              ok: true,
            },
          };
        },
      },
    }));
    const internalMetadata = JSON.stringify({
      path: "/resources/config",
      operation: "loader",
      request: {
        search: {
          tag: ["framework", "bun"],
        },
      },
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

    expect(response.statusCode).toBe(200);
    expect(capturedHref).toBe("http://localhost:5173/resources/config?tag=framework&tag=bun");
    expect(capturedTags).toEqual(["framework", "bun"]);
  });

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

  test("API routes load through the RSC environment runner", async () => {
    const ssrLoadModule = mock(async () => {
      throw new Error("API routes should not use server.ssrLoadModule().");
    });
    const resolveId = mock(async (id: string) => ({ id: `resolved:${id}` }));
    const importModule = mock(async (id: string) => {
      expect(id).toContain("src/api/test.ts");

      return {
        api: {
          methods: {
            GET() {
              return new Response("ok");
            },
          },
        },
      };
    });
    const server = {
      config: { root: "/fake-root" },
      ssrFixStacktrace: mock(() => {}),
      ssrLoadModule,
      environments: {
        rsc: {
          pluginContainer: {
            resolveId,
          },
          runner: {
            import: importModule,
          },
        },
      },
    } as unknown as ViteDevServer;
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

    expect(response.statusCode).toBe(200);
    expect(response.getBody()).toBe("ok");
    expect(resolveId).toHaveBeenCalledTimes(1);
    expect(importModule).toHaveBeenCalledTimes(1);
    expect(ssrLoadModule).not.toHaveBeenCalled();
  });
});

describe("dev server error masking", () => {
  test("supports batched internal route loader requests and preserves requested order", async () => {
    let layoutCalls = 0;
    let routeCalls = 0;

    const server = createMockViteDevServer(async () => ({
      route: {
        async loader({ request, params }: { request: Request; params: Record<string, string> }) {
          routeCalls += 1;

          return {
            kind: "data",
            data: {
              source: "route",
              href: request.url,
              id: params.id,
            },
          };
        },
        options: {
          layout: {
            id: "projects.layout",
            path: "/projects",
            options: {
              async loader({ request }: { request: Request }) {
                layoutCalls += 1;

                return {
                  kind: "data",
                  data: {
                    source: "layout",
                    href: request.url,
                  },
                };
              },
            },
          },
        },
      },
    }));
    const internalMetadata = JSON.stringify({
      path: "/projects/:id",
      targets: ["projects.show", "projects.layout"],
      operation: "loader",
      request: {
        params: { id: "42" },
        search: {
          tab: "settings",
        },
      },
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
      [{ id: "projects.show", path: "/projects/:id", modulePath: "src/routes/projects.ts" }],
      request,
      response,
      next,
    );

    expect(response.statusCode).toBe(200);
    expect(layoutCalls).toBe(1);
    expect(routeCalls).toBe(1);
    expect(JSON.parse(response.getBody())).toEqual({
      kind: "batch",
      results: [
        {
          status: 200,
          body: {
            kind: "data",
            data: {
              source: "route",
              href: "http://localhost:5173/projects/42?tab=settings",
              id: "42",
            },
            revalidate: [],
          },
        },
        {
          status: 200,
          body: {
            kind: "data",
            data: {
              source: "layout",
              href: "http://localhost:5173/projects/42?tab=settings",
            },
            revalidate: [],
          },
        },
      ],
    });
  });

  test("treats missing internal route targets as faults", async () => {
    const server = createMockViteDevServer(async () => ({}));
    const internalMetadata = JSON.stringify({
      path: "/missing/:id",
      target: "missing.show",
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

    await handleLitzRouteRequest(server, [], request, response, next);

    expect(response.statusCode).toBe(404);
    expect(response.getBody()).toContain('"kind":"fault"');
    expect(response.getBody()).toContain("Route not found.");
  });

  test("treats missing internal resource handlers as faults", async () => {
    const server = createMockViteDevServer(async () => ({
      resource: {
        action() {
          return { kind: "data", data: { ok: true } };
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
          hasLoader: false,
          hasAction: true,
          hasComponent: false,
        },
      ],
      request,
      response,
      next,
    );

    expect(response.statusCode).toBe(405);
    expect(response.getBody()).toContain('"kind":"fault"');
    expect(response.getBody()).toContain("Resource does not define a loader.");
  });

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

  test("treats malformed percent-encoding in API route pathnames as bad requests", async () => {
    const server = createMockViteDevServer(async () => ({
      api: {
        methods: {
          GET() {
            return new Response("ok");
          },
        },
      },
    }));
    const request = createMockRequest({
      url: "/api/projects/%E0%A4%A",
      method: "GET",
    });
    const response = createMockResponse();
    const next = mock(() => {});

    await handleLitzApiRequest(
      server,
      [{ path: "/api/projects/:id", modulePath: "src/api/projects/[id].ts" }],
      request,
      response,
      next,
    );

    expect(response.statusCode).toBe(400);
    expect(response.getBody()).toBe("Bad Request");
    expect(next).not.toHaveBeenCalled();
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
          clientModulePath: null,
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

    test("discovers aliased and wrapped route exports", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "dashboard.ts");

        writeFileSync(
          file,
          [
            `import { defineRoute } from "litzjs";`,
            `const wrapRoute = (value: unknown) => value;`,
            `const baseRoute = defineRoute("/dashboard", { component: Dashboard });`,
            `const dashboardRoute = wrapRoute(baseRoute);`,
            `export { dashboardRoute as route };`,
          ].join("\n"),
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toEqual({
          id: "/dashboard",
          path: "/dashboard",
          modulePath: "src/routes/dashboard.ts",
          clientModulePath: null,
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("discovers an explicit client route boundary next to the server route", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "settings.tsx");

        writeFileSync(
          file,
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/settings", { loader: async () => {}, component: Settings });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "settings.client.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/settings", { component: Settings });`,
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toEqual({
          id: "/settings",
          path: "/settings",
          modulePath: "src/routes/settings.tsx",
          clientModulePath: "src/routes/settings.client.tsx",
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("discovers a TSX client route boundary next to a TS server route", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "profile.ts");

        writeFileSync(
          file,
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/profile", { loader: async () => {}, component: Profile });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "profile.client.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/profile", { component: Profile });`,
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toEqual({
          id: "/profile",
          path: "/profile",
          modulePath: "src/routes/profile.ts",
          clientModulePath: "src/routes/profile.client.tsx",
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("warns when a route-like file imports defineRoute without exporting route", async () => {
      const root = createTempProject();
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message?: unknown) => {
        warnings.push(String(message));
      };

      try {
        const file = path.join(root, "src", "routes", "missing-export.tsx");

        writeFileSync(
          file,
          `import { defineRoute } from "litzjs";\nexport const dashboard = defineRoute("/dashboard", { component: Dashboard });`,
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          `imports defineRoute from "litzjs" but does not export the expected "route" binding`,
        );
      } finally {
        console.warn = originalWarn;
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("warns when a route-like file imports an aliased defineRoute without exporting route", async () => {
      const root = createTempProject();
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message?: unknown) => {
        warnings.push(String(message));
      };

      try {
        const file = path.join(root, "src", "routes", "aliased-missing-export.tsx");

        writeFileSync(
          file,
          `import { defineRoute as makeRoute } from "litzjs";\nexport const dashboard = makeRoute("/dashboard", { component: Dashboard });`,
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          `imports defineRoute from "litzjs" but does not export the expected "route" binding`,
        );
      } finally {
        console.warn = originalWarn;
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("discovers an exported route that uses an aliased defineRoute import", async () => {
      const root = createTempProject();
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message?: unknown) => {
        warnings.push(String(message));
      };

      try {
        const file = path.join(root, "src", "routes", "aliased-route.tsx");

        writeFileSync(
          file,
          `import { defineRoute as makeRoute } from "litzjs";\nexport const route = makeRoute("/aliased", { component: Aliased });`,
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toEqual({
          id: "/aliased",
          path: "/aliased",
          modulePath: "src/routes/aliased-route.tsx",
          clientModulePath: null,
        });
        expect(warnings).toHaveLength(0);
      } finally {
        console.warn = originalWarn;
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("warns when an exported route uses an unsupported dynamic path", async () => {
      const root = createTempProject();
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message?: unknown) => {
        warnings.push(String(message));
      };

      try {
        const file = path.join(root, "src", "routes", "dynamic-path.tsx");

        writeFileSync(
          file,
          `import { defineRoute } from "litzjs";\nconst path = "/dynamic";\nexport const route = defineRoute(path, { component: Dynamic });`,
        );

        const result = await discoverRouteFromFile(root, file);

        expect(result).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          `exports "route", but the path could not be read from a static defineRoute call`,
        );
      } finally {
        console.warn = originalWarn;
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
          clientModulePath: null,
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

    test("discovers aliased layout exports", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "app-layout.tsx");

        writeFileSync(
          file,
          [
            `import { defineLayout } from "litzjs";`,
            `const appLayout = defineLayout("/app", { component: AppLayout });`,
            `export { appLayout as layout };`,
          ].join("\n"),
        );

        const result = await discoverLayoutFromFile(root, file);

        expect(result).toEqual({
          id: "/app",
          path: "/app",
          modulePath: "src/routes/app-layout.tsx",
          clientModulePath: null,
        });
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
          clientModulePath: null,
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
          clientModulePath: null,
          hasLoader: true,
          hasAction: false,
          hasComponent: false,
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("discovers wrapped resource exports", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "resources", "wrapped.ts");

        writeFileSync(
          file,
          [
            `import { defineResource } from "litzjs";`,
            `const wrapResource = (value: unknown) => value;`,
            `const wrappedResource = wrapResource(`,
            `  defineResource("/resource/wrapped", {`,
            `    loader: async () => {},`,
            `    action: async () => {},`,
            `    component: WrappedResource,`,
            `  }),`,
            `);`,
            `export { wrappedResource as resource };`,
          ].join("\n"),
        );

        const result = await discoverResourceFromFile(root, file);

        expect(result).toEqual({
          path: "/resource/wrapped",
          modulePath: "src/routes/resources/wrapped.ts",
          clientModulePath: null,
          hasLoader: true,
          hasAction: true,
          hasComponent: true,
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("detects extracted resource options from a local binding", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "resources", "bound-options.ts");

        writeFileSync(
          file,
          [
            `import { defineResource } from "litzjs";`,
            `const options = {`,
            `  loader: async () => {},`,
            `  action: async () => {},`,
            `  component: BoundOptionsResource,`,
            `};`,
            `export const resource = defineResource("/resource/bound-options", options);`,
          ].join("\n"),
        );

        const result = await discoverResourceFromFile(root, file);

        expect(result).toEqual({
          path: "/resource/bound-options",
          modulePath: "src/routes/resources/bound-options.ts",
          clientModulePath: null,
          hasLoader: true,
          hasAction: true,
          hasComponent: true,
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
          clientModulePath: null,
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

    test("discovers aliased and wrapped API route exports", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "api", "wrapped-health.ts");

        writeFileSync(
          file,
          [
            `import { defineApiRoute } from "litzjs";`,
            `const wrapApi = (value: unknown) => value;`,
            `const healthApi = wrapApi(`,
            `  defineApiRoute("/api/wrapped-health", {`,
            `    GET() {`,
            `      return Response.json({ ok: true });`,
            `    },`,
            `  }),`,
            `);`,
            `export { healthApi as api };`,
          ].join("\n"),
        );

        const result = await discoverApiRouteFromFile(root, file);

        expect(result).toEqual({
          path: "/api/wrapped-health",
          modulePath: "src/routes/api/wrapped-health.ts",
          clientModulePath: null,
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("discovers route-like exports from JavaScript modules", async () => {
      const root = createTempProject();

      try {
        const file = path.join(root, "src", "routes", "api", "health.mjs");

        writeFileSync(
          file,
          [
            `import { defineApiRoute } from "litzjs";`,
            `export const api = defineApiRoute("/api/js-health", {`,
            `  GET() {`,
            `    return Response.json({ ok: true });`,
            `  },`,
            `});`,
          ].join("\n"),
        );

        const result = await discoverApiRouteFromFile(root, file);

        expect(result).toEqual({
          path: "/api/js-health",
          modulePath: "src/routes/api/health.mjs",
          clientModulePath: null,
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    test("warns when an API file imports defineApiRoute without exporting api", async () => {
      const root = createTempProject();
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (message?: unknown) => {
        warnings.push(String(message));
      };

      try {
        const file = path.join(root, "src", "routes", "api", "missing-export.ts");

        writeFileSync(
          file,
          `import { defineApiRoute } from "litzjs";\nexport const health = defineApiRoute("/api/health", { GET() { return Response.json({ ok: true }); } });`,
        );

        const result = await discoverApiRouteFromFile(root, file);

        expect(result).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(
          `imports defineApiRoute from "litzjs" but does not export the expected "api" binding`,
        );
      } finally {
        console.warn = originalWarn;
        rmSync(root, { force: true, recursive: true });
      }
    });
  });

  describe("discoverAllManifests", () => {
    test("discovers .js and .jsx route-like modules with the default patterns", async () => {
      const root = createTempProject();

      try {
        writeFileSync(
          path.join(root, "src", "routes", "home.jsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/home", { component: Home });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "resources", "data.js"),
          `import { defineResource } from "litzjs";\nexport const resource = defineResource("/resource/data", { loader: async () => {} });`,
        );
        writeFileSync(
          path.join(root, "src", "routes", "api", "health.js"),
          `import { defineApiRoute } from "litzjs";\nexport const api = defineApiRoute("/api/health", { GET() { return Response.json({ ok: true }); } });`,
        );

        const result = await discoverAllManifests(
          root,
          [
            "src/routes/**/*.{ts,tsx,js,jsx}",
            "!src/routes/api/**/*.{ts,tsx,js,jsx}",
            "!src/routes/resources/**/*.{ts,tsx,js,jsx}",
          ],
          ["src/routes/resources/**/*.{ts,tsx,js,jsx}"],
          ["src/routes/api/**/*.{ts,tsx,js,jsx}"],
        );

        expect(result.routeManifest).toHaveLength(1);
        expect(result.routeManifest[0]?.path).toBe("/home");
        expect(result.resourceManifest).toHaveLength(1);
        expect(result.resourceManifest[0]?.path).toBe("/resource/data");
        expect(result.apiManifest).toHaveLength(1);
        expect(result.apiManifest[0]?.path).toBe("/api/health");
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

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

    test("does not treat .cclient files as client boundary modules", async () => {
      const root = createTempProject();

      try {
        writeFileSync(
          path.join(root, "src", "routes", "typo.cclient.tsx"),
          `import { defineRoute } from "litzjs";\nexport const route = defineRoute("/typo", { component: Typo });`,
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

        expect(result.routeManifest).toHaveLength(1);
        expect(result.routeManifest[0]?.path).toBe("/typo");
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

  describe("non-runnable rsc environment middleware bypass", () => {
    function createMockViteDevServerWithoutRunner(
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
          },
        },
      } as unknown as ViteDevServer;
    }

    test("resource handler calls next() when rsc environment has no runner", async () => {
      const server = createMockViteDevServerWithoutRunner(async () => ({}));
      const request = createMockRequest({
        url: "/_litzjs/resource",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "/resources/config", operation: "loader" }),
      });
      const response = createMockResponse();
      const next = mock(() => {});

      await handleLitzResourceRequest(server, [], request, response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    test("route handler calls next() when rsc environment has no runner", async () => {
      const server = createMockViteDevServerWithoutRunner(async () => ({}));
      const request = createMockRequest({
        url: "/_litzjs/route",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "/dashboard" }),
      });
      const response = createMockResponse();
      const next = mock(() => {});

      await handleLitzRouteRequest(server, [], request, response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    test("api handler calls next() when rsc environment has no runner", async () => {
      const server = createMockViteDevServerWithoutRunner(async () => ({}));
      const request = createMockRequest({
        url: "/api/data",
        method: "GET",
      });
      const response = createMockResponse();
      const next = mock(() => {});

      await handleLitzApiRequest(server, [], request, response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
