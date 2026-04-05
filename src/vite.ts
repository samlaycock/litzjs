/**
 * Litz Vite plugin.
 *
 * Orchestrates a multi-environment build (RSC → client → SSR), registers dev
 * server middleware for route/resource/API handling, and finalizes production
 * artifacts into a single-file server bundle.
 */
import type { RscPluginOptions } from "@vitejs/plugin-rsc";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import type { Connect, InlineConfig, Plugin, PluginOption, ViteDevServer } from "vite";

import vitePluginRsc from "@vitejs/plugin-rsc";
import { nitro as nitroVitePlugin } from "nitro/vite";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import { glob } from "tinyglobby";
import ts from "typescript";
import { createBuilder } from "vite";

import type { ApiRouteMethod } from "./index";

import { joinBasePath, normalizeBasePath, resolveBasePathname } from "./base-path";
import { createClientModuleProjection } from "./client-projection";
import {
  createApiResponseFromResult,
  isServerResultLike,
  resolveValidatedInput,
  type RuntimeInputValidation,
} from "./input-validation";
import {
  extractRouteLikeParams,
  hasMalformedPathnameEncoding,
  interpolatePath,
  matchPathname,
  sortByPathSpecificity,
} from "./path-matching";
import { createSearchParams, type SearchParamRecord } from "./search-params";
import { parseInternalRequestBody, type InternalRequestBody } from "./server/internal-requests";
import { createInternalHandlerHeaders } from "./server/request-headers";

export interface LitzRouteRule {
  /** Response caching configuration, or `false` to disable. */
  readonly cache?:
    | false
    | {
        /** Time-to-live in seconds for cached responses. */
        readonly maxAge?: number;
        /** Enable stale-while-revalidate caching. */
        readonly swr?: boolean;
        /** Vary by these request headers. */
        readonly varies?: string[];
      };
  /** Additional response headers applied to matching routes. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Redirect matching routes to another path. */
  readonly redirect?:
    | string
    | {
        readonly to: string;
        readonly status?: number;
      };
  /** Pre-render this route at build time. */
  readonly prerender?: boolean;
  /** Proxy matching routes to an upstream URL. */
  readonly proxy?:
    | string
    | {
        readonly to: string;
      };
}

export interface LitzPluginOptions {
  /** Glob patterns for route files. */
  readonly routes?: string[];
  /** Glob patterns for API route files. */
  readonly api?: string[];
  /** Glob patterns for resource files. */
  readonly resources?: string[];
  /** Path to a custom server entry file. */
  readonly server?: string;
  /** Options forwarded to `@vitejs/plugin-rsc`. */
  readonly rsc?: Omit<RscPluginOptions, "entries" | "serverHandler">;
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

type DiscoveredRoute = {
  id: string;
  path: string;
  modulePath: string;
};

type DiscoveredLayout = {
  id: string;
  path: string;
  modulePath: string;
};

type DiscoveredResource = {
  path: string;
  modulePath: string;
  hasLoader: boolean;
  hasAction: boolean;
  hasComponent: boolean;
};

type DiscoveredApiRoute = {
  path: string;
  modulePath: string;
};

// Virtual module IDs. Each pair has a bare ID (used in import statements) and a
// resolved ID prefixed with `\0` — the Vite convention that marks a module as
// virtual so it is never resolved from disk.
const ROUTE_MANIFEST_ID = "virtual:litzjs:route-manifest";
const RESOLVED_ROUTE_MANIFEST_ID = "\0virtual:litzjs:route-manifest";
const RESOURCE_MANIFEST_ID = "virtual:litzjs:resource-manifest";
const RESOLVED_RESOURCE_MANIFEST_ID = "\0virtual:litzjs:resource-manifest";
const SERVER_MANIFEST_ID = "virtual:litzjs:server-manifest";
const RESOLVED_SERVER_MANIFEST_ID = "\0virtual:litzjs:server-manifest";
const LITZ_RSC_ENTRY_ID = "virtual:litzjs:rsc-entry";
const RESOLVED_LITZ_RSC_ENTRY_ID = "\0virtual:litzjs:rsc-entry";
const LITZ_BROWSER_ENTRY_ID = "virtual:litzjs:browser-entry";
const RESOLVED_LITZ_BROWSER_ENTRY_ID = "\0virtual:litzjs:browser-entry";
const LITZ_RSC_RENDERER_ID = "virtual:litzjs:rsc-renderer";
const RESOLVED_LITZ_RSC_RENDERER_ID = "\0virtual:litzjs:rsc-renderer";
const LITZ_NITRO_RENDERER_FILENAME = "nitro-renderer.ts";

/**
 * Creates the Litz Vite plugin array. Returns the `@vitejs/plugin-rsc` plugins
 * plus the core Litz plugin. The mutable state variables below are populated
 * during `configResolved` and kept in sync during dev via file watching.
 */
export function litz(options: LitzPluginOptions = {}): PluginOption {
  let root = process.cwd();
  let configuredBase = "/";
  let browserEntryPath = "src/main.tsx";
  let serverEntryPath: string | null = null;
  let serverEntryFilePath: string | null = null;
  let intermediateBuildOutDir = path.resolve(root, "dist");
  let finalNitroOutDir = path.resolve(root, ".output");
  let routeManifest: DiscoveredRoute[] = [];
  let layoutManifest: DiscoveredLayout[] = [];
  let resourceManifest: DiscoveredResource[] = [];
  let apiManifest: DiscoveredApiRoute[] = [];
  let clientProjectedFiles = new Set<string>();
  const routePatterns = options.routes ?? [
    "src/routes/**/*.{ts,tsx}",
    "!src/routes/api/**/*.{ts,tsx}",
    "!src/routes/resources/**/*.{ts,tsx}",
  ];
  const resourcePatterns = options.resources ?? ["src/routes/resources/**/*.{ts,tsx}"];
  const apiPatterns = options.api ?? ["src/routes/api/**/*.{ts,tsx}"];
  // Write a placeholder Nitro renderer file so the nitro plugin can resolve
  // it during its `config` hook. The file is re-written in `configResolved`
  // once the actual server entry path is known.
  writeNitroRendererSync(root, null);
  const rscPlugins = vitePluginRsc({
    ...options.rsc,
    entries: {
      client: LITZ_BROWSER_ENTRY_ID,
      rsc: LITZ_RSC_ENTRY_ID,
    },
    serverHandler: false,
  });

  const litzPlugin: Plugin = {
    name: "litzjs/vite",

    // Configure the client environment. The RSC plugin (@vitejs/plugin-rsc)
    // manages its own rsc and ssr environments with appropriate defaults.
    config(userConfig) {
      const baseOutDir = userConfig.build?.outDir ?? "dist";

      return {
        environments: {
          client: {
            build: {
              outDir: path.join(baseOutDir, "client"),
              manifest: true,
            },
          },
        },
      };
    },

    async configResolved(config) {
      root = config.root;
      configuredBase = normalizeBasePath(config.base);
      intermediateBuildOutDir = path.resolve(root, config.build.outDir || "dist");
      finalNitroOutDir = path.resolve(root, ".output");

      browserEntryPath = await discoverBrowserEntry(root);
      serverEntryPath = await discoverServerEntry(root, options.server);
      serverEntryFilePath = serverEntryPath ? path.resolve(root, serverEntryPath) : null;

      // Re-write with the actual server entry path now that it has been
      // discovered.
      writeNitroRendererSync(root, serverEntryPath);

      ({ routeManifest, layoutManifest, resourceManifest, apiManifest } =
        await discoverAllManifests(root, routePatterns, resourcePatterns, apiPatterns));
      clientProjectedFiles = createClientProjectedFileSet(
        root,
        routeManifest,
        layoutManifest,
        resourceManifest,
        apiManifest,
      );
    },

    // Map virtual module IDs to their resolved counterparts so Vite knows
    // these are generated in-memory by the `load` hook below.
    resolveId(id) {
      if (id === ROUTE_MANIFEST_ID) {
        return RESOLVED_ROUTE_MANIFEST_ID;
      }

      if (id === RESOURCE_MANIFEST_ID) {
        return RESOLVED_RESOURCE_MANIFEST_ID;
      }

      if (id === SERVER_MANIFEST_ID) {
        return RESOLVED_SERVER_MANIFEST_ID;
      }

      if (id === LITZ_RSC_ENTRY_ID) {
        return RESOLVED_LITZ_RSC_ENTRY_ID;
      }

      if (id === LITZ_BROWSER_ENTRY_ID) {
        return RESOLVED_LITZ_BROWSER_ENTRY_ID;
      }

      if (id === LITZ_RSC_RENDERER_ID) {
        return RESOLVED_LITZ_RSC_RENDERER_ID;
      }

      return null;
    },

    // Return generated code for each virtual module. The route/resource
    // manifests are built from the discovered filesystem entries; the RSC and
    // browser entries wire up the framework's server and client entry points.
    load(id) {
      if (id === RESOLVED_ROUTE_MANIFEST_ID) {
        return createRouteManifestModule(
          routeManifest,
          root,
          this.environment.name === "client",
          configuredBase,
        );
      }

      if (id === RESOLVED_RESOURCE_MANIFEST_ID) {
        return createResourceManifestModule(resourceManifest);
      }

      if (id === RESOLVED_SERVER_MANIFEST_ID) {
        return createServerManifestModule(routeManifest, resourceManifest, apiManifest);
      }

      if (id === RESOLVED_LITZ_RSC_ENTRY_ID) {
        if (serverEntryPath) {
          return `export { default } from ${JSON.stringify(toProjectImportSpecifier(serverEntryPath))};`;
        }

        return `
import { createServer } from "litzjs/server";
import { serverManifest } from ${JSON.stringify(SERVER_MANIFEST_ID)};

export default createServer({
  base: ${JSON.stringify(configuredBase)},
  manifest: serverManifest,
  createContext() {
    return undefined;
  },
});
`;
      }

      if (id === RESOLVED_LITZ_BROWSER_ENTRY_ID) {
        return `
if (import.meta.hot) {
  globalThis.__litzjsViteHot = import.meta.hot;
}

// The imported app graph executes before this assignment, but the transport
// helpers only read the value lazily during fetch calls, matching the existing
// HMR global pattern above.
globalThis.__litzjsBaseUrl = ${JSON.stringify(configuredBase)};

import ${JSON.stringify(toBrowserImportSpecifier(root, browserEntryPath, configuredBase))};
`;
      }

      if (id === RESOLVED_LITZ_RSC_RENDERER_ID) {
        return `
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";

export async function renderView(node, metadata = {}) {
  const stream = renderToReadableStream(node);
  return new Response(stream, {
    status: metadata.status ?? 200,
    headers: {
      "content-type": "text/x-component",
      "x-litzjs-kind": "view",
      "x-litzjs-status": String(metadata.status ?? 200),
      "x-litzjs-view-id": metadata.viewId ?? "litzjs#view",
      "x-litzjs-revalidate": Array.isArray(metadata.revalidate) ? metadata.revalidate.join(",") : ""
    }
  });
}
`;
      }

      return null;
    },

    // Dev server setup. Watches the filesystem for route/layout/resource/API
    // changes, re-discovers manifests on change, and triggers a full reload only
    // when the manifests actually differ (JSON comparison). Registers middleware
    // in order: resources → routes → API → document.
    configureServer(server) {
      const isRouteCandidate = picomatch(routePatterns);
      const isResourceCandidate = picomatch(resourcePatterns);
      const isApiCandidate = picomatch(apiPatterns);
      const isManifestCandidate = (p: string) =>
        isRouteCandidate(p) || isResourceCandidate(p) || isApiCandidate(p);

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingFullDiscovery = false;
      let manifestGeneration = 0;
      const pendingRetry = new Set<string>();
      const inFlightSingleFile = new Set<string>();

      const flushManifestRefresh = async () => {
        if (pendingFullDiscovery) {
          pendingFullDiscovery = false;
          manifestGeneration++;
          const generation = manifestGeneration;

          const next = await discoverAllManifests(
            root,
            routePatterns,
            resourcePatterns,
            apiPatterns,
          );

          if (manifestGeneration !== generation || pendingFullDiscovery) {
            return;
          }

          const changed =
            JSON.stringify(routeManifest) !== JSON.stringify(next.routeManifest) ||
            JSON.stringify(layoutManifest) !== JSON.stringify(next.layoutManifest) ||
            JSON.stringify(resourceManifest) !== JSON.stringify(next.resourceManifest) ||
            JSON.stringify(apiManifest) !== JSON.stringify(next.apiManifest);

          routeManifest = next.routeManifest;
          layoutManifest = next.layoutManifest;
          resourceManifest = next.resourceManifest;
          apiManifest = next.apiManifest;
          clientProjectedFiles = createClientProjectedFileSet(
            root,
            routeManifest,
            layoutManifest,
            resourceManifest,
            apiManifest,
          );

          if (changed) {
            invalidateVirtualModule(server, RESOLVED_ROUTE_MANIFEST_ID);
            invalidateVirtualModule(server, RESOLVED_RESOURCE_MANIFEST_ID);
            server.ws.send({ type: "full-reload" });
          }
        }
      };

      const scheduleRefresh = () => {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void flushManifestRefresh().catch((err) => {
            console.error("[litzjs] error during manifest discovery:", err);
          });
        }, 50);
      };

      const updateManifestEntry = <T extends { modulePath: string }>(
        manifest: T[],
        entry: T | null,
        file: string,
        sort?: (items: T[]) => T[],
      ): { manifest: T[]; changed: boolean } => {
        const modulePath = normalizeRelativePath(root, file);
        const idx = manifest.findIndex((r) => r.modulePath === modulePath);

        if (entry && idx >= 0) {
          if (JSON.stringify(manifest[idx]) !== JSON.stringify(entry)) {
            const next = manifest.map((item, i) => (i === idx ? entry : item));

            return { manifest: sort ? sort(next) : next, changed: true };
          }
        } else if (entry && idx < 0) {
          const next = [...manifest, entry];

          return { manifest: sort ? sort(next) : next, changed: true };
        } else if (!entry && idx >= 0) {
          return { manifest: manifest.filter((_, i) => i !== idx), changed: true };
        }

        return { manifest, changed: false };
      };

      const refreshSingleFile = async (file: string) => {
        if (pendingFullDiscovery) {
          return;
        }

        const generation = manifestGeneration;
        const relativePath = normalizeRelativePath(root, file);
        let changed = false;

        if (isRouteCandidate(relativePath)) {
          const entry = await discoverRouteFromFile(root, file);

          if (manifestGeneration !== generation) {
            return;
          }

          const result = updateManifestEntry(routeManifest, entry, file, sortByPathSpecificity);

          routeManifest = result.manifest;
          changed = changed || result.changed;

          const layoutEntry = await discoverLayoutFromFile(root, file);

          if (manifestGeneration !== generation) {
            return;
          }

          const layoutResult = updateManifestEntry(layoutManifest, layoutEntry, file);

          layoutManifest = layoutResult.manifest;
          changed = changed || layoutResult.changed;
        }

        if (isResourceCandidate(relativePath)) {
          const entry = await discoverResourceFromFile(root, file);

          if (manifestGeneration !== generation) {
            return;
          }

          const result = updateManifestEntry(resourceManifest, entry, file);

          resourceManifest = result.manifest;
          changed = changed || result.changed;
        }

        if (isApiCandidate(relativePath)) {
          const entry = await discoverApiRouteFromFile(root, file);

          if (manifestGeneration !== generation) {
            return;
          }

          const result = updateManifestEntry(apiManifest, entry, file, sortByPathSpecificity);

          apiManifest = result.manifest;
          changed = changed || result.changed;
        }

        if (changed) {
          clientProjectedFiles = createClientProjectedFileSet(
            root,
            routeManifest,
            layoutManifest,
            resourceManifest,
            apiManifest,
          );
          invalidateVirtualModule(server, RESOLVED_ROUTE_MANIFEST_ID);
          invalidateVirtualModule(server, RESOLVED_RESOURCE_MANIFEST_ID);
          server.ws.send({ type: "full-reload" });
        }
      };

      const runSingleFileRefresh = (file: string) => {
        inFlightSingleFile.add(file);
        void refreshSingleFile(file)
          .catch((err: NodeJS.ErrnoException) => {
            if (err?.code !== "ENOENT") {
              console.error("[litzjs] error refreshing file manifest:", err);
            }
          })
          .finally(() => {
            inFlightSingleFile.delete(file);

            if (pendingRetry.has(file)) {
              pendingRetry.delete(file);

              if (!pendingFullDiscovery) {
                runSingleFileRefresh(file);
              }
            }
          });
      };

      const onFileAddOrUnlink = (file: string) => {
        if (!/\.(ts|tsx)$/.test(file)) {
          return;
        }

        const relativePath = normalizeRelativePath(root, file);

        if (!isManifestCandidate(relativePath)) {
          return;
        }

        pendingFullDiscovery = true;
        scheduleRefresh();
      };

      const onFileChange = (file: string) => {
        if (!/\.(ts|tsx)$/.test(file)) {
          return;
        }

        const relativePath = normalizeRelativePath(root, file);

        if (!isManifestCandidate(relativePath)) {
          return;
        }

        if (inFlightSingleFile.has(file)) {
          pendingRetry.add(file);

          return;
        }

        runSingleFileRefresh(file);
      };

      server.watcher.on("add", onFileAddOrUnlink);
      server.watcher.on("change", onFileChange);
      server.watcher.on("unlink", onFileAddOrUnlink);

      // Mark Litz internal requests so Nitro's dev middleware skips them.
      // Nitro's `nitroDevMiddlewarePre` checks `req._nitroHandled` and calls
      // `next()` when set, letting our handlers below process the request.
      server.middlewares.use((request, _response, next) => {
        const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;
        const pathname = requestUrl
          ? resolveBasePathname(requestUrl.pathname, configuredBase)
          : "/";

        if (pathname.startsWith("/_litzjs/")) {
          (request as unknown as Record<string, unknown>)._nitroHandled = true;
        }
        next();
      });
      server.middlewares.use((request, response, next) => {
        void handleLitzResourceRequest(
          server,
          resourceManifest,
          request,
          response,
          next,
          configuredBase,
        );
      });
      server.middlewares.use((request, response, next) => {
        void handleLitzRouteRequest(server, routeManifest, request, response, next, configuredBase);
      });
      server.middlewares.use((request, response, next) => {
        void handleLitzApiRequest(server, apiManifest, request, response, next, configuredBase);
      });
      server.middlewares.use((request, response, next) => {
        void handleLitzDocumentRequest(server, request, response, next, configuredBase);
      });
    },

    hotUpdate(options) {
      if (this.environment.name !== "client" || options.type !== "update") {
        return;
      }

      if (!/\.(ts|tsx)$/.test(options.file)) {
        return;
      }

      const cleanId = normalizeViteModuleId(options.file);

      if (!clientProjectedFiles.has(cleanId)) {
        return;
      }

      return collectClientHotUpdateModules(this.environment, options.file, options.modules, root);
    },

    async transform(code, id) {
      const cleanId = normalizeViteModuleId(id);

      if (
        this.environment.name === "nitro" &&
        serverEntryFilePath &&
        cleanId === serverEntryFilePath
      ) {
        const transformed = injectServerManifestIntoServerEntry(cleanId, code, configuredBase);

        if (!transformed) {
          return null;
        }

        return {
          code: transformed,
          map: null,
        };
      }

      if (this.environment.name !== "client") {
        return null;
      }

      if (!clientProjectedFiles.has(cleanId)) {
        return null;
      }

      const projected = createClientModuleProjection(cleanId, code);

      if (!projected) {
        return null;
      }

      return {
        code: projected,
        map: null,
      };
    },
  };

  const nitroPlugins = nitroVitePlugin({
    scanDirs: [],
    renderer: {
      handler: path.resolve(root, ".litzjs", LITZ_NITRO_RENDERER_FILENAME),
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

  const cleanupPlugin: Plugin = {
    name: "litzjs/build-cleanup",
    sharedDuringBuild: true,
    buildApp: {
      order: "post",
      async handler() {
        cleanupIntermediateBuildArtifacts(root, intermediateBuildOutDir, finalNitroOutDir);
      },
    },
  };

  // The explicit cast prevents a "Plugin<any>[]" leak caused by Nitro's
  // module augmentation that adds a generic parameter to Vite's Plugin
  // interface, which triggers an "excessive stack depth" error when
  // consumers pass the result into `defineConfig({ plugins: [litz()] })`.
  return [...rscPlugins, litzPlugin, ...nitroPlugins, cleanupPlugin] as Plugin[];
}

export async function buildLitzApp(inlineConfig: InlineConfig = {}): Promise<void> {
  const builder = await createBuilder(inlineConfig, false);
  await builder.buildApp();
}

// ── Filesystem Discovery ─────────────────────────────────────────────────────
// Scans the project for routes, layouts, resources, and API routes using glob
// patterns. Each `discover*FromFile` helper extracts metadata from the exported
// bindings in an individual module using a lightweight TypeScript AST pass.

export async function discoverAllManifests(
  root: string,
  routePatterns: string[],
  resourcePatterns: string[],
  apiPatterns: string[],
): Promise<{
  routeManifest: DiscoveredRoute[];
  layoutManifest: DiscoveredLayout[];
  resourceManifest: DiscoveredResource[];
  apiManifest: DiscoveredApiRoute[];
}> {
  const [nextRouteManifest, nextLayoutManifest, nextResourceManifest, nextApiManifest] =
    await Promise.all([
      discoverRoutes(root, routePatterns),
      discoverLayouts(root, routePatterns),
      discoverResources(root, resourcePatterns),
      discoverApiRoutes(root, apiPatterns),
    ]);

  return {
    routeManifest: sortByPathSpecificity(nextRouteManifest),
    layoutManifest: nextLayoutManifest,
    resourceManifest: nextResourceManifest,
    apiManifest: sortByPathSpecificity(nextApiManifest),
  };
}

async function discoverBrowserEntry(root: string): Promise<string> {
  const indexHtmlPath = path.join(root, "index.html");

  try {
    const html = await readFile(indexHtmlPath, "utf8");
    const scriptMatch = html.match(
      /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["'][^>]*><\/script>/i,
    );
    const scriptSrc = scriptMatch?.[1];

    if (!scriptSrc) {
      return "src/main.tsx";
    }

    return scriptSrc.startsWith("/") ? scriptSrc.slice(1) : scriptSrc;
  } catch {
    return "src/main.tsx";
  }
}

export async function discoverServerEntry(
  root: string,
  configuredPath?: string,
): Promise<string | null> {
  const candidates = configuredPath ? [configuredPath] : ["src/server.ts", "src/server/index.ts"];

  for (const candidate of candidates) {
    const absolutePath = path.resolve(root, candidate);

    if (ts.sys.fileExists(absolutePath)) {
      return normalizeRelativePath(root, absolutePath);
    }
  }

  return null;
}

async function discoverRoutes(root: string, patterns: string[]): Promise<DiscoveredRoute[]> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
  });

  const discovered = await Promise.all(
    files.map(async (file) => discoverRouteFromFile(root, file)),
  );

  return discovered.filter((entry): entry is DiscoveredRoute => entry !== null);
}

async function discoverLayouts(root: string, patterns: string[]): Promise<DiscoveredLayout[]> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
  });

  const discovered = await Promise.all(
    files.map(async (file) => discoverLayoutFromFile(root, file)),
  );

  return discovered.filter((entry): entry is DiscoveredLayout => entry !== null);
}

interface DiscoveredRouteLikeDefinition {
  readonly path: string;
  readonly options?: ts.Expression;
}

function createModuleSourceFile(filePath: string, source: string): ts.SourceFile {
  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : filePath.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function hasExportModifier(modifiers: readonly ts.ModifierLike[] | undefined): boolean {
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function unwrapManifestExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)) {
    return unwrapManifestExpression(expression.expression);
  }

  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return unwrapManifestExpression(expression.expression);
  }

  return expression;
}

function getStringLiteralValue(expression: ts.Expression | undefined): string | null {
  if (!expression) {
    return null;
  }

  const unwrapped = unwrapManifestExpression(expression);

  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.text;
  }

  return null;
}

function getObjectPropertyName(propertyName: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(propertyName) ||
    ts.isStringLiteral(propertyName) ||
    ts.isNoSubstitutionTemplateLiteral(propertyName) ||
    ts.isNumericLiteral(propertyName)
  ) {
    return propertyName.text;
  }

  return null;
}

function resolveBoundExpression(
  expression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, ts.Expression>,
  seenBindings: Set<string>,
): ts.Expression | null {
  if (!expression) {
    return null;
  }

  const unwrapped = unwrapManifestExpression(expression);

  if (ts.isIdentifier(unwrapped)) {
    if (seenBindings.has(unwrapped.text)) {
      return null;
    }

    const binding = bindings.get(unwrapped.text);

    if (!binding) {
      return null;
    }

    const nextSeenBindings = new Set(seenBindings);
    nextSeenBindings.add(unwrapped.text);
    return resolveBoundExpression(binding, bindings, nextSeenBindings);
  }

  return unwrapped;
}

function hasObjectProperty(
  expression: ts.Expression | undefined,
  bindings: ReadonlyMap<string, ts.Expression>,
  propertyName: string,
): boolean {
  const resolvedExpression = resolveBoundExpression(expression, bindings, new Set());

  if (!resolvedExpression || !ts.isObjectLiteralExpression(resolvedExpression)) {
    return false;
  }

  return resolvedExpression.properties.some((property) => {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isMethodDeclaration(property) ||
      ts.isShorthandPropertyAssignment(property)
    ) {
      return property.name ? getObjectPropertyName(property.name) === propertyName : false;
    }

    return false;
  });
}

function resolveRouteLikeFactoryCall(
  expression: ts.Expression,
  bindings: ReadonlyMap<string, ts.Expression>,
  factoryName: string,
  seenBindings: Set<string>,
): DiscoveredRouteLikeDefinition | null {
  const unwrapped = unwrapManifestExpression(expression);

  if (ts.isIdentifier(unwrapped)) {
    if (seenBindings.has(unwrapped.text)) {
      return null;
    }

    const binding = bindings.get(unwrapped.text);

    if (!binding) {
      return null;
    }

    const nextSeenBindings = new Set(seenBindings);
    nextSeenBindings.add(unwrapped.text);
    return resolveRouteLikeFactoryCall(binding, bindings, factoryName, nextSeenBindings);
  }

  if (
    ts.isCallExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    unwrapped.expression.text === factoryName
  ) {
    const routeLikePath = getStringLiteralValue(unwrapped.arguments[0]);

    if (!routeLikePath) {
      return null;
    }

    return {
      path: routeLikePath,
      options: unwrapped.arguments[1],
    };
  }

  let discoveredDefinition: DiscoveredRouteLikeDefinition | null = null;

  ts.forEachChild(unwrapped, (child) => {
    if (discoveredDefinition || !ts.isExpression(child)) {
      return;
    }

    discoveredDefinition = resolveRouteLikeFactoryCall(
      child,
      bindings,
      factoryName,
      new Set(seenBindings),
    );

    return discoveredDefinition ?? undefined;
  });

  return discoveredDefinition;
}

function discoverExportedRouteLikeDefinition(
  source: string,
  filePath: string,
  exportName: string,
  factoryName: string,
): DiscoveredRouteLikeDefinition | null {
  const sourceFile = createModuleSourceFile(filePath, source);
  const bindings = new Map<string, ts.Expression>();
  const exportedBindings = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement.modifiers);

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }

        bindings.set(declaration.name.text, declaration.initializer);

        if (exported) {
          exportedBindings.set(declaration.name.text, declaration.name.text);
        }
      }

      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        exportedBindings.set(element.name.text, element.propertyName?.text ?? element.name.text);
      }
    }
  }

  const exportedBinding = exportedBindings.get(exportName);

  if (!exportedBinding) {
    return null;
  }

  return resolveRouteLikeFactoryCall(
    ts.factory.createIdentifier(exportedBinding),
    bindings,
    factoryName,
    new Set(),
  );
}

export async function discoverRouteFromFile(
  root: string,
  file: string,
): Promise<DiscoveredRoute | null> {
  const source = await readFile(file, "utf8");
  const routeDefinition = discoverExportedRouteLikeDefinition(source, file, "route", "defineRoute");

  if (!routeDefinition) {
    return null;
  }

  const relativeModulePath = normalizeRelativePath(root, file);

  return {
    id: routeDefinition.path,
    path: routeDefinition.path,
    modulePath: relativeModulePath,
  };
}

export async function discoverLayoutFromFile(
  root: string,
  file: string,
): Promise<DiscoveredLayout | null> {
  const source = await readFile(file, "utf8");
  const layoutDefinition = discoverExportedRouteLikeDefinition(
    source,
    file,
    "layout",
    "defineLayout",
  );

  if (!layoutDefinition) {
    return null;
  }

  return {
    id: layoutDefinition.path,
    path: layoutDefinition.path,
    modulePath: normalizeRelativePath(root, file),
  };
}

async function discoverResources(root: string, patterns: string[]): Promise<DiscoveredResource[]> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
  });

  const discovered = await Promise.all(
    files.map(async (file) => discoverResourceFromFile(root, file)),
  );

  return discovered.filter((entry): entry is DiscoveredResource => entry !== null);
}

export async function discoverResourceFromFile(
  root: string,
  file: string,
): Promise<DiscoveredResource | null> {
  const source = await readFile(file, "utf8");
  const resourceDefinition = discoverExportedRouteLikeDefinition(
    source,
    file,
    "resource",
    "defineResource",
  );

  if (!resourceDefinition) {
    return null;
  }

  const sourceFile = createModuleSourceFile(file, source);
  const bindings = new Map<string, ts.Expression>();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      bindings.set(declaration.name.text, declaration.initializer);
    }
  }

  return {
    path: resourceDefinition.path,
    modulePath: normalizeRelativePath(root, file),
    hasLoader: hasObjectProperty(resourceDefinition.options, bindings, "loader"),
    hasAction: hasObjectProperty(resourceDefinition.options, bindings, "action"),
    hasComponent: hasObjectProperty(resourceDefinition.options, bindings, "component"),
  };
}

async function discoverApiRoutes(root: string, patterns: string[]): Promise<DiscoveredApiRoute[]> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
  });

  const discovered = await Promise.all(
    files.map(async (file) => discoverApiRouteFromFile(root, file)),
  );

  return discovered.filter((entry): entry is DiscoveredApiRoute => entry !== null);
}

export async function discoverApiRouteFromFile(
  root: string,
  file: string,
): Promise<DiscoveredApiRoute | null> {
  const source = await readFile(file, "utf8");
  const apiDefinition = discoverExportedRouteLikeDefinition(source, file, "api", "defineApiRoute");

  if (!apiDefinition) {
    return null;
  }

  return {
    path: apiDefinition.path,
    modulePath: normalizeRelativePath(root, file),
  };
}

// ── Virtual Module Generation ────────────────────────────────────────────────
// These functions produce the source code for virtual modules (route manifest,
// resource manifest, server manifest, etc.) that are returned by the `load` hook.

function createRouteManifestModule(
  manifest: DiscoveredRoute[],
  root: string,
  lazy: boolean,
  base: string,
): string {
  if (!lazy) {
    const imports: string[] = [];
    const lines = manifest.map((route, index) => {
      const importName = `routeModule${index}`;
      imports.push(
        `import * as ${importName} from ${JSON.stringify(toProjectImportSpecifier(route.modulePath))};`,
      );

      return [
        `  {`,
        `    id: ${JSON.stringify(route.id)},`,
        `    path: ${JSON.stringify(route.path)},`,
        `    load: async () => ({ route: ${importName}.route })`,
        `  }${index === manifest.length - 1 ? "" : ","}`,
      ].join("\n");
    });

    return [...imports, "", `export const routeManifest = [`, lines.join("\n"), `];`].join("\n");
  }

  const lines = manifest.map((route, index) => {
    const importPath = toBrowserImportSpecifier(root, route.modulePath, base);
    const resolvedModuleFile = path.resolve(root, route.modulePath);

    return [
      `  {`,
      `    id: ${JSON.stringify(route.id)},`,
      `    path: ${JSON.stringify(route.path)},`,
      `    moduleFile: ${JSON.stringify(resolvedModuleFile)},`,
      `    load: () => import(${JSON.stringify(importPath)})`,
      `  }${index === manifest.length - 1 ? "" : ","}`,
    ].join("\n");
  });

  return [`export const routeManifest = [`, lines.join("\n"), `];`].join("\n");
}

function createClientProjectedFileSet(
  root: string,
  routes: DiscoveredRoute[],
  layouts: DiscoveredLayout[],
  resources: DiscoveredResource[],
  apiRoutes: DiscoveredApiRoute[],
): Set<string> {
  return new Set(
    [...routes, ...layouts, ...resources, ...apiRoutes].map((entry) =>
      path.resolve(root, entry.modulePath),
    ),
  );
}

/**
 * Build-time transform that injects the server manifest into the user's server
 * entry. Uses the TypeScript compiler API to find all `createServer()` calls
 * (imported from `litzjs/server`) and wraps their options argument with a
 * helper that merges in the route/resource/API manifest. Returns `null` if no
 * `createServer` import is found.
 */
function injectServerManifestIntoServerEntry(
  filePath: string,
  source: string,
  base: string,
): string | null {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const createServerImportNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    if (statement.moduleSpecifier.text !== "litzjs/server") {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;

    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "createServer") {
        createServerImportNames.add(element.name.text);
      }
    }
  }

  if (createServerImportNames.size === 0) {
    return null;
  }

  const result = ts.transform(sourceFile, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          createServerImportNames.has(node.expression.text)
        ) {
          return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("__litzjsMergeServerOptions"),
              undefined,
              [node.arguments[0] ?? ts.factory.createIdentifier("undefined")],
            ),
          ]);
        }

        return ts.visitEachChild(node, visit, context);
      };

      return (node: ts.SourceFile) => ts.visitEachChild(node, visit, context);
    },
  ]);
  const transformedSource = result.transformed[0] as ts.SourceFile;
  result.dispose();

  const importStatement = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(
          false,
          ts.factory.createIdentifier("serverManifest"),
          ts.factory.createIdentifier("__litzjsServerManifest"),
        ),
      ]),
    ),
    ts.factory.createStringLiteral(SERVER_MANIFEST_ID),
    undefined,
  );
  const helperStatement = ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier("__litzjsMergeServerOptions"),
          undefined,
          undefined,
          ts.factory.createArrowFunction(
            undefined,
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                ts.factory.createIdentifier("options"),
              ),
            ],
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createParenthesizedExpression(
              ts.factory.createObjectLiteralExpression(
                [
                  ts.factory.createPropertyAssignment(
                    ts.factory.createIdentifier("manifest"),
                    ts.factory.createIdentifier("__litzjsServerManifest"),
                  ),
                  ts.factory.createSpreadAssignment(
                    ts.factory.createBinaryExpression(
                      ts.factory.createIdentifier("options"),
                      ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
                      ts.factory.createObjectLiteralExpression(),
                    ),
                  ),
                  ts.factory.createPropertyAssignment(
                    ts.factory.createIdentifier("base"),
                    ts.factory.createStringLiteral(base),
                  ),
                ],
                true,
              ),
            ),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  return [
    printer.printNode(ts.EmitHint.Unspecified, importStatement, transformedSource),
    printer.printNode(ts.EmitHint.Unspecified, helperStatement, transformedSource),
    ...transformedSource.statements.map((statement) =>
      printer.printNode(ts.EmitHint.Unspecified, statement, transformedSource),
    ),
    "",
  ].join("\n\n");
}

function normalizeViteModuleId(id: string): string {
  return path.resolve(id.replace(/[?#].*$/, ""));
}

function createResourceManifestModule(manifest: DiscoveredResource[]): string {
  const serialized = JSON.stringify(manifest, null, 2);
  return `export const resourceManifest = ${serialized};`;
}

function createServerManifestModule(
  routes: DiscoveredRoute[],
  resources: DiscoveredResource[],
  apiRoutes: DiscoveredApiRoute[],
): string {
  const imports: string[] = [];

  const routeEntries = routes.map((entry, index) => {
    const name = `routeModule${index}`;
    imports.push(
      `import * as ${name} from ${JSON.stringify(toProjectImportSpecifier(entry.modulePath))};`,
    );
    return `{ id: ${JSON.stringify(entry.id)}, path: ${JSON.stringify(entry.path)}, route: ${name}.route }`;
  });

  const resourceEntries = resources.map((entry, index) => {
    const name = `resourceModule${index}`;
    imports.push(
      `import * as ${name} from ${JSON.stringify(toProjectImportSpecifier(entry.modulePath))};`,
    );
    return `{ path: ${JSON.stringify(entry.path)}, resource: ${name}.resource }`;
  });

  const apiEntries = apiRoutes.map((entry, index) => {
    const name = `apiModule${index}`;
    imports.push(
      `import * as ${name} from ${JSON.stringify(toProjectImportSpecifier(entry.modulePath))};`,
    );
    return `{ path: ${JSON.stringify(entry.path)}, api: ${name}.api }`;
  });

  return [
    ...imports,
    "",
    "export const serverManifest = {",
    `  routes: [${routeEntries.join(", ")}],`,
    `  resources: [${resourceEntries.join(", ")}],`,
    `  apiRoutes: [${apiEntries.join(", ")}],`,
    "};",
  ].join("\n");
}

function invalidateVirtualModule(server: ViteDevServer, id: string): void {
  const module = server.moduleGraph.getModuleById(id);

  if (module) {
    server.moduleGraph.invalidateModule(module);
  }
}

function collectClientHotUpdateModules<TModule extends { id: string | null }>(
  environment: {
    moduleGraph: {
      getModuleById(id: string): TModule | undefined;
      getModulesByFile(file: string): Set<TModule> | undefined;
    };
  },
  file: string,
  modules: readonly TModule[],
  root: string,
): TModule[] | undefined {
  const collectedModules = new Set(modules);

  for (const module of environment.moduleGraph.getModulesByFile(file) ?? []) {
    collectedModules.add(module);
  }

  const relativeModulePath = normalizeRelativePath(root, file);
  const importSpecifier = toImportSpecifier(root, relativeModulePath);
  const directImportModule = environment.moduleGraph.getModuleById(importSpecifier);

  if (directImportModule) {
    collectedModules.add(directImportModule);
  }

  const normalizedModule = environment.moduleGraph.getModuleById(normalizeViteModuleId(file));

  if (normalizedModule) {
    collectedModules.add(normalizedModule);
  }

  return collectedModules.size > 0 ? [...collectedModules] : undefined;
}

function normalizeRelativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function toImportSpecifier(root: string, relativeModulePath: string): string {
  const absolutePath = path.resolve(root, relativeModulePath);
  return `/@fs/${absolutePath.split(path.sep).join("/")}`;
}

function toBrowserImportSpecifier(root: string, relativeModulePath: string, base: string): string {
  return joinBasePath(base, toImportSpecifier(root, relativeModulePath));
}

function toProjectImportSpecifier(relativeModulePath: string): string {
  return `/${relativeModulePath}`;
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

// ── Dev Server Request Handlers ──────────────────────────────────────────────
// Middleware functions that handle incoming requests during development. Each
// handler converts Node.js IncomingMessage/ServerResponse to Fetch API Request/
// Response, loads the relevant module from the RSC environment, and executes
// the route/resource/API/document handler.

type DevMiddlewareContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext | undefined;
};

type DevMiddlewareNext<TContext = unknown, TResult = unknown> = (overrides?: {
  context?: TContext | undefined;
}) => Promise<TResult>;

type DevMiddlewareHandler<TContext = unknown, TResult = unknown> = (
  context: DevMiddlewareContext<TContext>,
  next: DevMiddlewareNext<TContext, TResult>,
) => Promise<TResult> | TResult;

type DevRouteMatchEntry = {
  id: string;
  path: string;
  loader?: (context: unknown) => Promise<unknown>;
  input?: RuntimeInputValidation;
  middleware: DevMiddlewareHandler<unknown, unknown>[];
};

type BatchedLoaderResponseEntry = {
  status: number;
  headers?: Array<[string, string]>;
  body: {
    kind: "data" | "redirect" | "error" | "fault";
    data?: unknown;
    revalidate?: string[];
    location?: string;
    replace?: boolean;
    message?: string;
    code?: string;
    digest?: string;
  };
};

function hasRunnableRscEnvironment(server: ViteDevServer): boolean {
  const env = server.environments.rsc as unknown as
    | {
        runner?: unknown;
      }
    | undefined;

  return typeof env?.runner === "object" && env.runner !== null;
}

export async function handleLitzResourceRequest(
  server: ViteDevServer,
  manifest: DiscoveredResource[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  let viewId = "litzjs#view";
  const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;
  const pathname = requestUrl ? resolveBasePathname(requestUrl.pathname, base) : "/";

  if (!hasRunnableRscEnvironment(server)) {
    next();
    return;
  }

  if (pathname !== "/_litzjs/resource") {
    next();
    return;
  }

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end("Method Not Allowed");
    return;
  }

  try {
    const internalRequest = await createNodeRequest(request);
    const body = await parseInternalRequestBody(internalRequest);

    const resourcePath = body.path;
    const operation = body.operation ?? "loader";
    const entry = manifest.find((resource) => resource.path === resourcePath);

    if (!resourcePath || !entry) {
      sendLitzJson(response, 404, { kind: "fault", message: "Resource not found." });
      return;
    }

    const module = await loadLitzServerModule<{
      resource?: {
        loader?: (context: unknown) => Promise<unknown>;
        action?: (context: unknown) => Promise<unknown>;
        input?: RuntimeInputValidation;
        middleware?: DevMiddlewareHandler<unknown, unknown>[];
      };
    }>(server, toImportSpecifier(server.config.root, entry.modulePath));
    const resource = module.resource as
      | {
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        }
      | undefined;

    if (!resource) {
      sendLitzJson(response, 500, {
        kind: "fault",
        message: "Resource module did not export resource.",
      });
      return;
    }

    const handler = operation === "action" ? resource.action : resource.loader;
    viewId = `${entry.path}#${operation}`;

    if (!handler) {
      sendLitzJson(response, 405, {
        kind: "fault",
        message: `Resource does not define a ${operation}.`,
      });
      return;
    }

    const normalizedRequest = normalizeInternalResourceRequest(
      internalRequest,
      resourcePath,
      body.request,
      body.payload,
    );
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    const signal = controller.signal;
    const result = await runDevMiddlewareChain({
      middleware: resource.middleware ?? [],
      request: normalizedRequest.request,
      params: normalizedRequest.params,
      signal,
      context: undefined,
      async execute(nextContext) {
        const input = await resolveValidatedInput({
          validation: resource.input,
          request: normalizedRequest.request,
          params: normalizedRequest.params,
          signal,
          context: nextContext,
        });

        return handler({
          request: normalizedRequest.request,
          params: normalizedRequest.params,
          signal,
          context: nextContext,
          input,
        });
      },
    });

    await sendServerResult(server, response, result, viewId);
  } catch (error) {
    if (isServerResultLike(error)) {
      await sendServerResult(server, response, error, viewId);
      return;
    }

    server.ssrFixStacktrace(error as Error);
    console.error(error);
    sendLitzJson(response, 500, {
      kind: "fault",
      message: "Resource request failed.",
    });
  }
}

export async function handleLitzRouteRequest(
  server: ViteDevServer,
  manifest: DiscoveredRoute[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  let viewId = "litzjs#view";
  const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;
  const pathname = requestUrl ? resolveBasePathname(requestUrl.pathname, base) : "/";

  if (!hasRunnableRscEnvironment(server)) {
    next();
    return;
  }

  if (pathname !== "/_litzjs/route" && pathname !== "/_litzjs/action") {
    next();
    return;
  }

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.end("Method Not Allowed");
    return;
  }

  try {
    const internalRequest = await createNodeRequest(request);
    const body = await parseInternalRequestBody(internalRequest);

    const routePath = body.path;
    const targetId = body.target;
    const targetIds = body.targets?.filter((value): value is string => typeof value === "string");
    const operation = body.operation ?? (pathname === "/_litzjs/action" ? "action" : "loader");
    const entry = manifest.find((route) => route.path === routePath);

    if (!routePath || !entry) {
      sendLitzJson(response, 404, { kind: "fault", message: "Route not found." });
      return;
    }

    const module = await loadLitzServerModule<{
      layout?: {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
      route?: {
        id?: string;
        path?: string;
        loader?: (context: unknown) => Promise<unknown>;
        action?: (context: unknown) => Promise<unknown>;
        options?: {
          layout?: {
            id: string;
            path: string;
            options?: {
              layout?: unknown;
              loader?: (context: unknown) => Promise<unknown>;
              input?: RuntimeInputValidation;
              middleware?: DevMiddlewareHandler<unknown, unknown>[];
            };
          };
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
    }>(server, toImportSpecifier(server.config.root, entry.modulePath));
    const route = module.route as
      | {
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          options?: {
            layout?: {
              id: string;
              path: string;
              options?: {
                layout?: unknown;
                loader?: (context: unknown) => Promise<unknown>;
                input?: RuntimeInputValidation;
                middleware?: DevMiddlewareHandler<unknown, unknown>[];
              };
            };
            loader?: (context: unknown) => Promise<unknown>;
            action?: (context: unknown) => Promise<unknown>;
            input?: RuntimeInputValidation;
            middleware?: DevMiddlewareHandler<unknown, unknown>[];
          };
        }
      | undefined;

    if (!route) {
      sendLitzJson(response, 500, { kind: "fault", message: "Route module did not export route." });
      return;
    }

    const chain = getDevRouteMatchChain({
      id: entry.id,
      path: entry.path,
      route,
    });
    const normalizedRequest = normalizeInternalResourceRequest(
      internalRequest,
      routePath,
      body.request,
      body.payload,
    );
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    const signal = controller.signal;

    if (operation === "loader" && targetIds && targetIds.length > 0) {
      const results: BatchedLoaderResponseEntry[] = [];

      for (const batchTargetId of targetIds) {
        const batchTarget = findDevTargetRouteMatch(chain, batchTargetId);

        if (!batchTarget) {
          sendLitzJson(response, 404, { kind: "fault", message: "Route target not found." });
          return;
        }

        const batchResult = await executeDevRouteTarget({
          route,
          operation,
          chain,
          target: batchTarget,
          normalizedRequest,
          signal,
        });
        const serializedResult = createDevBatchedLoaderResponseEntry(batchResult);

        if (!serializedResult) {
          sendLitzJson(response, 409, {
            kind: "fault",
            message: "Batched route loaders do not support view results.",
          });
          return;
        }

        results.push(serializedResult);
      }

      sendLitzJson(response, 200, {
        kind: "batch",
        results,
      });
      return;
    }

    const target =
      operation === "action"
        ? chain[chain.length - 1]
        : findDevTargetRouteMatch(chain, targetId ?? routePath);

    if (!target) {
      sendLitzJson(response, 404, { kind: "fault", message: "Route target not found." });
      return;
    }

    viewId = `${target.id}#${operation}`;
    const result = await executeDevRouteTarget({
      route,
      operation,
      chain,
      target,
      normalizedRequest,
      signal,
    });

    await sendServerResult(server, response, result, viewId);
  } catch (error) {
    if (isServerResultLike(error)) {
      await sendServerResult(server, response, error, viewId);
      return;
    }

    server.ssrFixStacktrace(error as Error);
    console.error(error);
    sendLitzJson(response, 500, {
      kind: "fault",
      message: "Route request failed.",
    });
  }
}

async function handleLitzDocumentRequest(
  server: ViteDevServer,
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  const url = request.url ?? "/";
  const requestUrl = new URL(url, "http://litzjs.local");
  const pathname = resolveBasePathname(requestUrl.pathname, base);

  if (request.method !== "GET" && request.method !== "HEAD") {
    next();
    return;
  }

  if (
    pathname.startsWith("/_litzjs/") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/node_modules/")
  ) {
    next();
    return;
  }

  if (path.extname(pathname)) {
    next();
    return;
  }

  const accept = request.headers.accept ?? "";

  if (!accept.includes("text/html") && !accept.includes("*/*")) {
    next();
    return;
  }

  if (hasMalformedPathnameEncoding(requestUrl.pathname)) {
    sendBadRequest(response);
    return;
  }

  try {
    const templatePath = path.join(server.config.root, "index.html");
    const template = await readFile(templatePath, "utf8");
    const html = await server.transformIndexHtml(url, template);
    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  } catch (error) {
    server.ssrFixStacktrace(error as Error);
    next(error as Error);
  }
}

export async function handleLitzApiRequest(
  server: ViteDevServer,
  manifest: DiscoveredApiRoute[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  base = "/",
): Promise<void> {
  if (!hasRunnableRscEnvironment(server)) {
    next();
    return;
  }

  const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;

  if (!requestUrl) {
    next();
    return;
  }

  const pathname = resolveBasePathname(requestUrl.pathname, base);

  if (hasMalformedPathnameEncoding(requestUrl.pathname)) {
    sendBadRequest(response);
    return;
  }

  const matched = manifest.find((entry) => matchPathPattern(entry.path, pathname));

  if (!matched) {
    next();
    return;
  }

  try {
    const module = await loadLitzServerModule<{
      api?: {
        input?: RuntimeInputValidation;
        middleware?: DevMiddlewareHandler<unknown, Response>[];
        methods?: Partial<
          Record<
            ApiRouteMethod,
            (context: {
              request: Request;
              params: Record<string, string>;
              signal: AbortSignal;
              context: unknown;
              input: {
                params: unknown;
                search: unknown;
                headers: unknown;
                body: unknown;
              };
            }) => Promise<Response> | Response
          >
        >;
      };
    }>(server, toImportSpecifier(server.config.root, matched.modulePath));
    const api = module.api;

    const method = (request.method ?? "GET").toUpperCase() as Exclude<ApiRouteMethod, "ALL">;
    const handler = api?.methods?.[method] ?? api?.methods?.ALL;
    const matchedParams = matchPathname(matched.path, requestUrl.pathname);

    if (!handler) {
      response.statusCode = 405;
      response.end("Method Not Allowed");
      return;
    }

    const apiRequest = await createNodeRequest(request, requestUrl);

    const controller = new AbortController();
    request.once("close", () => controller.abort());
    const signal = controller.signal;
    const apiResponse = await runDevMiddlewareChain({
      middleware: api?.middleware ?? [],
      request: apiRequest,
      params: matchedParams ?? {},
      signal,
      context: undefined,
      async execute(nextContext) {
        const input = await resolveValidatedInput({
          validation: api?.input,
          request: apiRequest,
          params: matchedParams ?? {},
          signal,
          context: nextContext,
        });

        return handler({
          request: apiRequest,
          params: matchedParams ?? {},
          signal,
          context: nextContext,
          input,
        });
      },
    });

    await writeFetchResponseToNode(response, apiResponse);
  } catch (error) {
    if (error instanceof Response) {
      await writeFetchResponseToNode(response, error);
      return;
    }

    if (isServerResultLike(error)) {
      await writeFetchResponseToNode(response, createApiResponseFromResult(error));
      return;
    }

    server.ssrFixStacktrace(error as Error);
    console.error(error);
    response.statusCode = 500;
    response.end("API route failed.");
  }
}

// ── Request / Response Utilities ──────────────────────────────────────────────
// Helpers for converting between Node.js IncomingMessage/ServerResponse and the
// Fetch API Request/Response types used by route handlers.

async function readRequestBuffer(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function createNodeRequest(
  request: IncomingMessage,
  url = createIncomingRequestUrl(request),
): Promise<Request> {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await readRequestBuffer(request);

  return new Request(url, {
    method: request.method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
}

function createIncomingRequestUrl(request: IncomingMessage): URL {
  const host =
    getForwardedRequestValue(request.headers["x-forwarded-host"]) ?? request.headers.host;
  const socket = request.socket as TLSSocket;
  const protocol =
    getForwardedRequestValue(request.headers["x-forwarded-proto"]) ??
    (socket.encrypted ? "https" : "http");

  return new URL(request.url ?? "/", `${protocol}://${host ?? "litzjs.local"}`);
}

function getForwardedRequestValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return undefined;
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);
}

function normalizeInternalResourceRequest(
  originalRequest: Request,
  resourcePath: string,
  requestData:
    | {
        params?: Record<string, string>;
        search?: SearchParamRecord;
      }
    | undefined,
  payload: InternalRequestBody["payload"],
): {
  request: Request;
  params: Record<string, string>;
} {
  const params = requestData?.params ?? {};
  const search = createSearchParams(requestData?.search);
  const url = new URL(originalRequest.url);
  url.pathname = interpolatePath(resourcePath, params, "resource");
  url.search = search.toString();
  url.hash = "";

  let body: FormData | undefined;

  if (payload) {
    body = new FormData();

    for (const [key, value] of payload.entries) {
      body.append(key, value);
    }
  }

  return {
    request: new Request(url, {
      method: body ? "POST" : "GET",
      headers: createInternalHandlerHeaders(originalRequest.headers),
      body,
    }),
    params,
  };
}

async function sendServerResult(
  server: ViteDevServer,
  response: ServerResponse,
  result: unknown,
  viewId = "litzjs#view",
): Promise<void> {
  if (!result || typeof result !== "object" || !("kind" in result)) {
    sendLitzJson(response, 500, {
      kind: "fault",
      message: "Handler returned an unknown result.",
    });
    return;
  }

  const serverResult = result as {
    kind: string;
    status?: number;
    headers?: HeadersInit;
    data?: unknown;
    node?: unknown;
    fields?: Record<string, string>;
    formError?: string;
    location?: string;
    replace?: boolean;
    revalidate?: string[];
    message?: string;
    code?: string;
    digest?: string;
  };

  applyHeaders(response, serverResult.headers);
  applyRevalidateHeader(response, serverResult.revalidate);

  switch (serverResult.kind) {
    case "data":
      sendLitzJson(response, serverResult.status ?? 200, {
        kind: "data",
        data: serverResult.data,
        revalidate: serverResult.revalidate ?? [],
      });
      return;
    case "invalid":
      sendLitzJson(response, serverResult.status ?? 422, {
        kind: "invalid",
        fields: serverResult.fields,
        formError: serverResult.formError,
        data: serverResult.data,
      });
      return;
    case "redirect":
      sendLitzJson(response, serverResult.status ?? 303, {
        kind: "redirect",
        location: serverResult.location,
        replace: serverResult.replace ?? false,
        revalidate: serverResult.revalidate ?? [],
      });
      return;
    case "error":
      sendLitzJson(response, serverResult.status ?? 500, {
        kind: "error",
        message: serverResult.message ?? "Error",
        code: serverResult.code,
        data: serverResult.data,
      });
      return;
    case "fault":
      sendLitzJson(response, serverResult.status ?? 500, {
        kind: "fault",
        message: serverResult.message ?? "Fault",
        digest: serverResult.digest,
      });
      return;
    case "view":
      const rscRenderer = await loadRscRenderer(server);
      const rscResponse = await rscRenderer.renderView(serverResult.node, {
        status: serverResult.status ?? 200,
        viewId,
        revalidate: serverResult.revalidate ?? [],
      });
      await writeFetchResponseToNode(response, rscResponse);
      return;
    default:
      sendLitzJson(response, 500, {
        kind: "fault",
        message: `Unsupported result kind "${serverResult.kind}".`,
      });
  }
}

async function loadLitzServerModule<T>(server: ViteDevServer, id: string): Promise<T> {
  const environment = getRscEnvironment(server);
  const resolved = await environment.pluginContainer.resolveId(id);

  if (!resolved) {
    throw new Error(`Failed to resolve Litz server module "${id}".`);
  }

  return environment.runner.import(resolved.id);
}

async function loadRscRenderer(server: ViteDevServer): Promise<{
  renderView(
    node: unknown,
    metadata?: { status?: number; viewId?: string; revalidate?: string[] },
  ): Promise<Response>;
}> {
  return loadLitzServerModule(server, LITZ_RSC_RENDERER_ID);
}

function getRscEnvironment(server: ViteDevServer): {
  pluginContainer: {
    resolveId(id: string): Promise<{ id: string } | null>;
  };
  runner: {
    import<T>(id: string): Promise<T>;
  };
} {
  return server.environments.rsc as unknown as {
    pluginContainer: {
      resolveId(id: string): Promise<{ id: string } | null>;
    };
    runner: {
      import<T>(id: string): Promise<T>;
    };
  };
}

// ── HTTP Response Helpers ────────────────────────────────────────────────────

function sendLitzJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/vnd.litzjs.result+json");
  response.end(JSON.stringify(body));
}

function sendBadRequest(response: ServerResponse): void {
  response.statusCode = 400;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end("Bad Request");
}

function applyHeaders(response: ServerResponse, headers?: HeadersInit): void {
  if (!headers) {
    return;
  }

  const normalized = new Headers(headers);

  normalized.forEach((value, key) => {
    response.setHeader(key, value);
  });
}

function applyRevalidateHeader(response: ServerResponse, revalidate?: string[]): void {
  if (!revalidate?.length) {
    return;
  }

  response.setHeader("x-litzjs-revalidate", revalidate.join(","));
}

async function writeFetchResponseToNode(
  response: ServerResponse,
  fetchResponse: Response,
): Promise<void> {
  response.statusCode = fetchResponse.status;

  fetchResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });

  if (!fetchResponse.body) {
    response.end();
    return;
  }

  const reader = fetchResponse.body.getReader();

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    response.write(Buffer.from(chunk.value));
  }

  response.end();
}

// ── Path & Route Matching ────────────────────────────────────────────────────
// Helpers for matching incoming request paths against route patterns, building
// layout chains, and extracting route parameters during development.

function matchPathPattern(pathPattern: string, pathname: string): boolean {
  return matchPathname(pathPattern, pathname) !== null;
}

function getDevRouteMatchChain(entry: {
  id: string;
  path: string;
  route: {
    loader?: (context: unknown) => Promise<unknown>;
    action?: (context: unknown) => Promise<unknown>;
    options?: {
      layout?: {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
      loader?: (context: unknown) => Promise<unknown>;
      input?: RuntimeInputValidation;
      middleware?: DevMiddlewareHandler<unknown, unknown>[];
    };
  };
}): DevRouteMatchEntry[] {
  const layouts = collectDevLayouts(entry.route.options?.layout);

  return [
    ...layouts.map((layout) => ({
      id: layout.id,
      path: layout.path,
      loader: layout.options?.loader,
      input: layout.options?.input,
      middleware: layout.options?.middleware ?? [],
    })),
    {
      id: entry.id,
      path: entry.path,
      loader: entry.route.loader ?? entry.route.options?.loader,
      input: entry.route.options?.input,
      middleware: entry.route.options?.middleware ?? [],
    },
  ];
}

function collectDevLayouts(
  layout:
    | {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      }
    | undefined,
): Array<{
  id: string;
  path: string;
  options?: {
    layout?: unknown;
    loader?: (context: unknown) => Promise<unknown>;
    input?: RuntimeInputValidation;
    middleware?: DevMiddlewareHandler<unknown, unknown>[];
  };
}> {
  if (!layout) {
    return [];
  }

  const parent = isDevLayout(layout.options?.layout)
    ? collectDevLayouts(layout.options?.layout)
    : [];

  return [...parent, layout];
}

function isDevLayout(value: unknown): value is {
  id: string;
  path: string;
  options?: {
    layout?: unknown;
    loader?: (context: unknown) => Promise<unknown>;
    input?: RuntimeInputValidation;
    middleware?: DevMiddlewareHandler<unknown, unknown>[];
  };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "path" in value &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { path?: unknown }).path === "string"
  );
}

function findDevTargetRouteMatch<TEntry extends { id: string }>(
  chain: TEntry[],
  targetId: string,
): TEntry | undefined {
  return chain.find((entry) => entry.id === targetId);
}

async function executeDevRouteTarget(options: {
  route: {
    loader?: (context: unknown) => Promise<unknown>;
    action?: (context: unknown) => Promise<unknown>;
    options?: {
      layout?: {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
          input?: RuntimeInputValidation;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
      loader?: (context: unknown) => Promise<unknown>;
      action?: (context: unknown) => Promise<unknown>;
      input?: RuntimeInputValidation;
      middleware?: DevMiddlewareHandler<unknown, unknown>[];
    };
  };
  operation: "loader" | "action";
  chain: DevRouteMatchEntry[];
  target: DevRouteMatchEntry;
  normalizedRequest: {
    request: Request;
    params: Record<string, string>;
  };
  signal: AbortSignal;
}): Promise<unknown> {
  const targetIndex = options.chain.findIndex((candidate) => candidate.id === options.target.id);
  const handler =
    options.operation === "action"
      ? (options.route.action ?? options.route.options?.action)
      : options.target.loader;
  const validation =
    options.operation === "action" ? options.route.options?.input : options.target.input;

  if (!handler) {
    return {
      kind: "fault",
      status: 405,
      message: `Route does not define a ${options.operation}.`,
    };
  }

  const params =
    options.operation === "action"
      ? options.normalizedRequest.params
      : (extractRouteLikeParams(
          options.target.path,
          new URL(options.normalizedRequest.request.url).pathname,
        ) ?? options.normalizedRequest.params);

  return runDevMiddlewareChain({
    middleware: options.chain
      .slice(0, targetIndex + 1)
      .flatMap((candidate) => candidate.middleware),
    request: options.normalizedRequest.request,
    params,
    signal: options.signal,
    context: undefined,
    async execute(nextContext) {
      const input = await resolveValidatedInput({
        validation,
        request: options.normalizedRequest.request,
        params,
        signal: options.signal,
        context: nextContext,
      });

      return handler({
        request: options.normalizedRequest.request,
        params,
        signal: options.signal,
        context: nextContext,
        input,
      });
    },
  });
}

function createDevBatchedLoaderResponseEntry(result: unknown): BatchedLoaderResponseEntry | null {
  if (!result || typeof result !== "object" || !("kind" in result)) {
    return {
      status: 500,
      body: {
        kind: "fault",
        message: "Handler returned an unknown result.",
      },
    };
  }

  const serverResult = result as {
    kind: string;
    status?: number;
    headers?: HeadersInit;
    data?: unknown;
    location?: string;
    replace?: boolean;
    revalidate?: string[];
    message?: string;
    code?: string;
    digest?: string;
  };
  const headers = new Headers(serverResult.headers);
  if (serverResult.revalidate?.length) {
    headers.set("x-litzjs-revalidate", serverResult.revalidate.join(","));
  }
  const serializedHeaderEntries = Array.from(headers.entries());
  const serializedHeaders =
    serializedHeaderEntries.length > 0 ? serializedHeaderEntries : undefined;

  switch (serverResult.kind) {
    case "data":
      return {
        status: serverResult.status ?? 200,
        headers: serializedHeaders,
        body: {
          kind: "data",
          data: serverResult.data,
          revalidate: serverResult.revalidate ?? [],
        },
      };
    case "redirect":
      return {
        status: serverResult.status ?? 303,
        headers: serializedHeaders,
        body: {
          kind: "redirect",
          location: serverResult.location,
          replace: serverResult.replace ?? false,
          revalidate: serverResult.revalidate ?? [],
        },
      };
    case "error":
      return {
        status: serverResult.status ?? 500,
        headers: serializedHeaders,
        body: {
          kind: "error",
          message: serverResult.message ?? "Error",
          code: serverResult.code,
          data: serverResult.data,
        },
      };
    case "fault":
      return {
        status: serverResult.status ?? 500,
        headers: serializedHeaders,
        body: {
          kind: "fault",
          message: serverResult.message ?? "Fault",
          digest: serverResult.digest,
        },
      };
    case "view":
      return null;
    default:
      return {
        status: 500,
        body: {
          kind: "fault",
          message: `Unsupported result kind "${serverResult.kind}".`,
        },
      };
  }
}

/**
 * Koa-style middleware dispatch. Recursively walks through `middleware` handlers
 * — each receives the current context and a `next()` function. Calling `next()`
 * invokes the next handler in the chain; the final handler calls `execute()`.
 * A guard prevents `next()` from being called more than once per handler.
 * Handlers can override the context for downstream middleware via `next({ context })`.
 */
async function runDevMiddlewareChain<TContext, TResult>(options: {
  middleware: DevMiddlewareHandler<TContext, TResult>[];
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext | undefined;
  execute(context: TContext | undefined): Promise<TResult> | TResult;
}): Promise<TResult> {
  const dispatch = async (index: number, context: TContext | undefined): Promise<TResult> => {
    const middleware = options.middleware[index];

    if (!middleware) {
      return options.execute(context);
    }

    let called = false;

    return middleware(
      {
        request: options.request,
        params: options.params,
        signal: options.signal,
        context,
      },
      async (overrides) => {
        if (called) {
          throw new Error("Litz middleware next() called multiple times.");
        }

        called = true;
        const nextContext =
          overrides && Object.prototype.hasOwnProperty.call(overrides, "context")
            ? overrides.context
            : context;
        return dispatch(index + 1, nextContext);
      },
    );
  };

  return dispatch(0, options.context);
}

// ── Nitro Renderer ───────────────────────────────────────────────────────────
// Writes a physical `.ts` file that Nitro can resolve during its `config` hook.
// Nitro uses Node.js module resolution (not Vite's virtual modules), so the
// renderer must exist on disk.

/**
 * Writes the Nitro renderer entry file to `.litzjs/nitro-renderer.ts`.
 *
 * When `serverEntryPath` is `null` (initial call before discovery), writes a
 * placeholder that exports a no-op handler. Once the server entry is known,
 * re-writes with the actual import so Nitro delegates to the Litz server.
 */
function writeNitroRendererSync(root: string, serverEntryPath: string | null): void {
  const litzjsDir = path.resolve(root, ".litzjs");

  mkdirSync(litzjsDir, { recursive: true });

  const rendererPath = path.resolve(litzjsDir, LITZ_NITRO_RENDERER_FILENAME);

  if (serverEntryPath === null) {
    writeFileSync(
      rendererPath,
      [
        "// Placeholder — replaced once the server entry is discovered.",
        'import { defineHandler } from "nitro/h3";',
        "",
        "export default defineHandler(() => new Response('Not ready', { status: 503 }));",
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  const serverImportPath = path.resolve(root, serverEntryPath).replaceAll("\\", "/");

  writeFileSync(
    rendererPath,
    [
      "// Auto-generated by litzjs — do not edit.",
      'import { defineHandler } from "nitro/h3";',
      `import server from "${serverImportPath}";`,
      "",
      "export default defineHandler(async (event) => {",
      "  return server.fetch(event.req);",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
}
