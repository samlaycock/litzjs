import type { Plugin, PluginOption } from "vite";

import { nitro as nitroVitePlugin } from "nitro/vite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { LitzRouteRule } from "./vite";

import { normalizeBasePath, resolveBasePathname } from "./base-path";
import { discoverServerEntry } from "./vite";

export interface LitzNitroPluginOptions {
  /** Path to a custom server entry file. Defaults to `src/server.ts` or `src/server/index.ts`. */
  readonly server?: string;
  /**
   * Deployment preset. Determines the server output format and runtime
   * adapter (e.g. `"node-server"`, `"cloudflare-pages"`, `"vercel"`).
   */
  readonly preset?: string;
  /**
   * Per-route rules for caching, headers, redirects, pre-rendering, and
   * proxying. Keys are path patterns (e.g. `"/api/**"`).
   */
  readonly routeRules?: Readonly<Record<string, LitzRouteRule>>;
  /**
   * Compress static assets with gzip, brotli, or zstd. Pass `true` to
   * enable all supported algorithms, or an object to pick individually.
   */
  readonly compressPublicAssets?:
    | boolean
    | {
        readonly gzip?: boolean;
        readonly brotli?: boolean;
        readonly zstd?: boolean;
      };
  /** Base URL path for the application (e.g. `"/app/"`). */
  readonly baseURL?: string;
  /** Generate source maps for the server build. */
  readonly sourcemap?: boolean;
  /** Minify the server build output. */
  readonly minify?: boolean;
}

const LITZ_NITRO_RENDERER_FILENAME = "nitro-renderer.ts";

export function litzNitro(options: LitzNitroPluginOptions = {}): PluginOption {
  const rendererRoot = process.cwd();
  let root = rendererRoot;
  let configuredBase = "/";
  let intermediateBuildOutDir = path.resolve(root, "dist");
  let finalNitroOutDir = path.resolve(root, ".output");

  // Nitro resolves its renderer during its config hook, before Vite config is
  // fully resolved, so the file must exist before constructing Nitro plugins.
  writeNitroRendererSync(rendererRoot, null);

  const nitroPlugins = nitroVitePlugin({
    scanDirs: [],
    renderer: {
      handler: path.resolve(rendererRoot, ".litzjs", LITZ_NITRO_RENDERER_FILENAME),
    },
    preset: options.preset,
    // LitzRouteRule is intentionally a framework-agnostic subset of Nitro's
    // NitroRouteConfig. The types are structurally compatible at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routeRules: options.routeRules as any,
    compressPublicAssets: options.compressPublicAssets,
    baseURL: options.baseURL,
    sourcemap: options.sourcemap,
    minify: options.minify,
  });

  // Prevent Nitro from hijacking the RSC-managed environments. Nitro's
  // `nitro:env` plugin auto-detects any environment with a build entry and
  // replaces its `createEnvironment` with a `FetchableDevEnvironment`, which
  // removes the module runner that the RSC plugin (and Litz's dev handlers)
  // rely on. We wrap that hook so it returns early for `rsc` and `ssr`.
  const rscManagedEnvironments = new Set(["rsc", "ssr"]);

  for (const plugin of nitroPlugins) {
    if (plugin.name === "nitro:env" && typeof plugin.configEnvironment === "function") {
      const original = plugin.configEnvironment;
      plugin.configEnvironment = function (name, ...args) {
        if (rscManagedEnvironments.has(name)) return;
        return original.call(this, name, ...args);
      };
      break;
    }
  }

  const litzNitroPlugin: Plugin = {
    name: "litzjs/nitro",
    sharedDuringBuild: true,

    async configResolved(config) {
      root = config.root;
      configuredBase = normalizeBasePath(config.base);
      intermediateBuildOutDir = path.resolve(root, config.build.outDir || "dist");
      finalNitroOutDir = path.resolve(root, ".output");

      const serverEntryPath = await discoverServerEntry(root, options.server);

      if (serverEntryPath === null) {
        throw new Error(
          [
            "litzNitro() could not find a server entry for the Nitro renderer.",
            'Create src/server.ts or src/server/index.ts, or pass the same custom server path to litzNitro({ server: "..." }) that you pass to litz({ server: "..." }).',
          ].join(" "),
        );
      }

      const rscOutDir = config.environments.rsc?.build.outDir ?? path.join("dist", "rsc");
      const isBuild = config.command === "build";
      const serverImportPath = isBuild
        ? path.resolve(root, rscOutDir, "index.js")
        : path.resolve(root, serverEntryPath);

      writeNitroRendererSync(
        rendererRoot,
        serverImportPath,
        isBuild
          ? {
              base: configuredBase,
              clientManifestPath: path.resolve(
                finalNitroOutDir,
                "public",
                ".vite",
                "manifest.json",
              ),
              template: readDocumentTemplate(root),
            }
          : null,
      );
    },

    configureServer(server) {
      // Mark Litz internal requests so Nitro's dev middleware skips them.
      // Nitro's `nitroDevMiddlewarePre` checks `req._nitroHandled` and calls
      // `next()` when set, letting the core Litz plugin process the request.
      server.middlewares.use((request, _response, next) => {
        const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;
        const pathname = requestUrl
          ? resolveBasePathname(requestUrl.pathname, configuredBase)
          : "/";

        if (pathname.startsWith("/_litzjs/") || pathname.startsWith("/api/")) {
          (request as unknown as Record<string, unknown>)._nitroHandled = true;
        }
        next();
      });
    },
  };

  const cleanupPlugin: Plugin = {
    name: "litzjs/nitro-cleanup",
    sharedDuringBuild: true,
    buildApp: {
      order: "post",
      async handler() {
        cleanupIntermediateBuildArtifacts(root, intermediateBuildOutDir, finalNitroOutDir);
      },
    },
  };

  return [litzNitroPlugin, ...nitroPlugins, cleanupPlugin] as Plugin[];
}

function hasCompletedNitroBuild(nitroOutDir: string): boolean {
  return (
    existsSync(path.join(nitroOutDir, "nitro.json")) &&
    existsSync(path.join(nitroOutDir, "public")) &&
    existsSync(path.join(nitroOutDir, "server"))
  );
}

function shouldRemoveIntermediateBuildArtifacts(
  root: string,
  intermediateBuildOutDir: string,
  nitroOutDir: string,
): boolean {
  if (!existsSync(intermediateBuildOutDir)) {
    return false;
  }

  if (intermediateBuildOutDir === root || intermediateBuildOutDir === nitroOutDir) {
    return false;
  }

  const relativeToRoot = path.relative(root, intermediateBuildOutDir);

  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return false;
  }

  const relativeToNitroOutDir = path.relative(nitroOutDir, intermediateBuildOutDir);

  return relativeToNitroOutDir.startsWith("..") || path.isAbsolute(relativeToNitroOutDir);
}

function cleanupIntermediateBuildArtifacts(
  root: string,
  intermediateBuildOutDir: string,
  nitroOutDir: string,
): void {
  if (!hasCompletedNitroBuild(nitroOutDir)) {
    return;
  }

  if (!shouldRemoveIntermediateBuildArtifacts(root, intermediateBuildOutDir, nitroOutDir)) {
    return;
  }

  rmSync(intermediateBuildOutDir, { force: true, recursive: true });
}

// Writes a physical `.ts` file that Nitro can resolve during its `config` hook.
function writeNitroRendererSync(
  rendererRoot: string,
  serverImportPath: string | null,
  documentOptions?: {
    readonly base: string;
    readonly clientManifestPath: string;
    readonly template: string;
  } | null,
): void {
  const litzjsDir = path.resolve(rendererRoot, ".litzjs");

  mkdirSync(litzjsDir, { recursive: true });

  const rendererPath = path.resolve(litzjsDir, LITZ_NITRO_RENDERER_FILENAME);

  if (serverImportPath === null) {
    writeFileSync(
      rendererPath,
      [
        "// Placeholder - replaced once the server entry is discovered.",
        'import { defineHandler } from "nitro/h3";',
        "",
        "export default defineHandler(() => new Response('Not ready', { status: 503 }));",
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  const normalizedServerImportPath = serverImportPath.replaceAll("\\", "/");
  const normalizedClientManifestPath = documentOptions?.clientManifestPath.replaceAll("\\", "/");

  writeFileSync(
    rendererPath,
    [
      "// Auto-generated by litzjs - do not edit.",
      'import { defineHandler } from "nitro/h3";',
      ...(normalizedClientManifestPath
        ? [`import clientManifest from "${normalizedClientManifestPath}";`]
        : []),
      `import server from "${normalizedServerImportPath}";`,
      "",
      ...(documentOptions
        ? [
            `const documentTemplate = ${JSON.stringify(documentOptions.template)};`,
            `const base = ${JSON.stringify(documentOptions.base)};`,
            "",
            "function joinBase(base, pathname) {",
            '  const normalizedBase = base === "/" ? "" : base.replace(/\\/$/, "");',
            '  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;',
            '  return `${normalizedBase}${normalizedPathname}` || "/";',
            "}",
            "",
            "function stripDevModuleScripts(html) {",
            '  return html.replace(/<script\\b(?=[^>]*\\btype=["\']module["\'])(?=[^>]*\\bsrc=["\'][^"\']+["\'])[^>]*>\\s*<\\/script>/gi, "");',
            "}",
            "",
            "function createDocumentResponse(request) {",
            '  if (request.method !== "GET" && request.method !== "HEAD") return null;',
            '  const accept = request.headers.get("accept") ?? "";',
            '  if (!accept.includes("text/html") && !accept.includes("*/*")) return null;',
            '  const entry = clientManifest["../../virtual:litzjs:browser-entry"] ?? Object.values(clientManifest).find((candidate) => candidate?.isEntry);',
            "  if (!entry?.file) return null;",
            '  const script = `<script type="module" src="${joinBase(base, entry.file)}"></script>`;',
            "  const html = stripDevModuleScripts(documentTemplate).replace(/<\\/body>/i, `${script}\\n  </body>`);",
            '  return new Response(request.method === "HEAD" ? null : html, {',
            "    status: 200,",
            '    headers: { "content-type": "text/html; charset=utf-8" },',
            "  });",
            "}",
            "",
          ]
        : []),
      "export default defineHandler(async (event) => {",
      "  const response = await server.fetch(event.req);",
      ...(documentOptions
        ? [
            "  if (response.status === 404) {",
            "    const documentResponse = createDocumentResponse(event.req);",
            "    if (documentResponse) return documentResponse;",
            "  }",
          ]
        : []),
      "  return response;",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
}

function readDocumentTemplate(root: string): string {
  const templatePath = path.resolve(root, "index.html");

  if (!existsSync(templatePath)) {
    return '<!doctype html><html><head><meta charset="UTF-8" /></head><body><div id="app"></div></body></html>';
  }

  return readFileSync(templatePath, "utf8");
}
