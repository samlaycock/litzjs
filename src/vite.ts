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
import type { Connect, Plugin, ViteDevServer } from "vite";

import vitePluginRsc from "@vitejs/plugin-rsc";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import { glob } from "tinyglobby";
import ts from "typescript";

import type { ApiRouteMethod } from "./index";

import { createClientModuleProjection } from "./client-projection";
import { extractRouteLikeParams, matchPathname, sortByPathSpecificity } from "./path-matching";
import { parseInternalRequestBody, type InternalRequestBody } from "./server/internal-requests";
import { createInternalHandlerHeaders } from "./server/request-headers";

export type LitzPluginOptions = {
  routes?: string[];
  api?: string[];
  resources?: string[];
  server?: string;
  embedAssets?: boolean;
  rsc?: Omit<RscPluginOptions, "entries" | "serverHandler">;
};

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

/**
 * Creates the Litz Vite plugin array. Returns the `@vitejs/plugin-rsc` plugins
 * plus the core Litz plugin. The mutable state variables below are populated
 * during `configResolved` and kept in sync during dev via file watching.
 */
export function litz(options: LitzPluginOptions = {}): Plugin[] {
  let root = process.cwd();
  let browserEntryPath = "src/main.tsx";
  let serverEntryPath: string | null = null;
  let serverEntryFilePath: string | null = null;
  let outputRootDir = path.resolve(root, "dist");
  let clientOutDir = path.resolve(root, "dist/client");
  let serverOutDir = path.resolve(root, "dist/server");
  let routeManifest: DiscoveredRoute[] = [];
  let layoutManifest: DiscoveredLayout[] = [];
  let resourceManifest: DiscoveredResource[] = [];
  let apiManifest: DiscoveredApiRoute[] = [];
  let clientProjectedFiles = new Set<string>();
  let closeBundlePassCount = 0;
  let hasFinalizedServerArtifacts = false;
  let hasRegisteredExitFinalizer = false;
  const routePatterns = options.routes ?? [
    "src/routes/**/*.{ts,tsx}",
    "!src/routes/api/**/*.{ts,tsx}",
    "!src/routes/resources/**/*.{ts,tsx}",
  ];
  const resourcePatterns = options.resources ?? ["src/routes/resources/**/*.{ts,tsx}"];
  const apiPatterns = options.api ?? ["src/routes/api/**/*.{ts,tsx}"];
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

    // Reset finalization state at the start of each build cycle so that
    // watch-mode rebuilds (`vite build --watch`) re-run finalization.
    // Scoped to the RSC environment (always first in the RSC → client → SSR
    // build order) to avoid resetting mid-cycle — a later reset would cause
    // re-finalization on an already-transformed index.js, which would fail
    // and incorrectly signal a broken build.
    buildStart() {
      if (this.environment?.name === "rsc") {
        closeBundlePassCount = 0;
        hasFinalizedServerArtifacts = false;
      }
    },

    // Configure three Vite environments:
    //  - client: SPA output (dist/client)
    //  - rsc: React Server Components, single-file output via codeSplitting: false (dist/server)
    //  - ssr: shares the server output dir; emptyOutDir: false to avoid clobbering RSC output
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
          rsc: {
            build: {
              outDir: path.join(baseOutDir, "server"),
              rollupOptions: {
                output: {
                  entryFileNames: "index.js",
                  format: "es",
                  codeSplitting: false,
                },
              },
            },
          },
          ssr: {
            build: {
              outDir: path.join(baseOutDir, "server"),
              emptyOutDir: false,
            },
          },
        },
      };
    },

    async configResolved(config) {
      root = config.root;
      outputRootDir = path.resolve(root, config.build.outDir || "dist");
      clientOutDir = path.resolve(
        root,
        config.environments.client?.build.outDir || path.join("dist", "client"),
      );
      serverOutDir = path.resolve(
        root,
        config.environments.rsc?.build.outDir || path.join("dist", "server"),
      );

      // Only validate the RSC output config during production builds — these
      // rollupOptions are irrelevant in dev mode where no bundling occurs.
      if (config.command === "build") {
        const rscOutput = config.environments.rsc?.build.rollupOptions?.output;
        const rscOutputs = Array.isArray(rscOutput) ? rscOutput : rscOutput ? [rscOutput] : [];

        if (rscOutputs.length === 0) {
          throw new Error(
            "litz: could not find a rollupOptions.output entry for the RSC environment. " +
              "This is an internal configuration error.",
          );
        }

        for (const output of rscOutputs) {
          if (output.codeSplitting !== false) {
            throw new Error(
              "litz: the RSC environment must have codeSplitting disabled " +
                "(rollupOptions.output.codeSplitting: false). " +
                "The server build pipeline requires a single entry file.",
            );
          }
        }
      }

      browserEntryPath = await discoverBrowserEntry(root);
      serverEntryPath = await discoverServerEntry(root, options.server);
      serverEntryFilePath = serverEntryPath ? path.resolve(root, serverEntryPath) : null;
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
        return createRouteManifestModule(routeManifest, root, this.environment.name === "client");
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
  manifest: serverManifest,
  createContext() {
    return undefined;
  },
});
`;
      }

      if (id === RESOLVED_LITZ_BROWSER_ENTRY_ID) {
        return `import ${JSON.stringify(toImportSpecifier(root, browserEntryPath))};`;
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

          if (manifestGeneration !== generation) {
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
        const relativePath = path.relative(root, file);
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
              runSingleFileRefresh(file);
            }
          });
      };

      const onFileAddOrUnlink = (file: string) => {
        if (!/\.(ts|tsx)$/.test(file)) {
          return;
        }

        const relativePath = path.relative(root, file);

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

        const relativePath = path.relative(root, file);

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

      server.middlewares.use((request, response, next) => {
        void handleLitzResourceRequest(server, resourceManifest, request, response, next);
      });
      server.middlewares.use((request, response, next) => {
        void handleLitzRouteRequest(server, routeManifest, request, response, next);
      });
      server.middlewares.use((request, response, next) => {
        void handleLitzApiRequest(server, apiManifest, request, response, next);
      });
      server.middlewares.use((request, response, next) => {
        void handleLitzDocumentRequest(server, request, response, next);
      });
    },

    async handleHotUpdate(context) {
      if (!/\.(ts|tsx)$/.test(context.file)) {
        return;
      }

      return context.modules;
    },

    async transform(code, id) {
      const cleanId = normalizeViteModuleId(id);

      if (
        this.environment.name === "rsc" &&
        serverEntryFilePath &&
        cleanId === serverEntryFilePath
      ) {
        const transformed = injectServerManifestIntoServerEntry(cleanId, code);

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

    // Vite's multi-environment build runs RSC → client → SSR sequentially, and
    // `closeBundle` fires after each environment. The RSC plugin writes its
    // assets manifest only after ALL environments complete, so finalization may
    // not succeed on the first call. We attempt it eagerly, and register a
    // `process.once("exit")` fallback to catch the case where the manifest
    // wasn't ready during earlier calls. Guard flags prevent duplicate work.
    async closeBundle() {
      closeBundlePassCount++;

      // These are intentionally called on every environment pass. We don't know
      // which pass has the client output ready (build order is RSC → client →
      // SSR), and both functions are designed to be idempotent — they return
      // early when their inputs (manifest, index.html) don't exist yet.
      await Promise.all([
        writeProductionIndexHtml(root, clientOutDir),
        removeLegacyBuildArtifacts(outputRootDir),
      ]);

      if (hasFinalizedServerArtifacts) {
        return;
      }

      if (!hasRegisteredExitFinalizer) {
        hasRegisteredExitFinalizer = true;
        process.once("exit", () => {
          if (hasFinalizedServerArtifacts) {
            return;
          }

          hasFinalizedServerArtifacts = finalizeServerArtifacts(
            serverOutDir,
            clientOutDir,
            options.embedAssets ?? false,
          );

          if (!hasFinalizedServerArtifacts) {
            process.exitCode = 1;
            console.error(
              "litz: failed to finalize server artifacts. " +
                "The assets manifest import could not be inlined — " +
                "the production server bundle may be broken.",
            );
          }
        });
      }

      // When embedAssets is enabled, skip finalization on the first pass (RSC
      // environment) because the client hasn't rebuilt yet — embedding at this
      // point would capture stale assets from the previous build cycle. The
      // client and SSR passes (or the exit handler) will finalize with fresh
      // client output.
      const inlineClientAssets = options.embedAssets ?? false;
      if (inlineClientAssets && closeBundlePassCount <= 1) {
        return;
      }

      hasFinalizedServerArtifacts = finalizeServerArtifacts(
        serverOutDir,
        clientOutDir,
        inlineClientAssets,
      );
    },
  };

  return [...rscPlugins, litzPlugin];
}

// ── Filesystem Discovery ─────────────────────────────────────────────────────
// Scans the project for routes, layouts, resources, and API routes using glob
// patterns. Each `discover*FromFile` helper extracts metadata (path, defineRoute
// call, etc.) from individual files using regex.

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

export async function discoverRouteFromFile(
  root: string,
  file: string,
): Promise<DiscoveredRoute | null> {
  const source = await readFile(file, "utf8");
  const match = source.match(
    /export\s+const\s+route\s*=\s*defineRoute(?:<[\s\S]*?>)?\(\s*["'`]([^"'`]+)["'`]/,
  );

  if (!match) {
    return null;
  }

  const routePath = match[1];

  if (!routePath) {
    return null;
  }

  const relativeModulePath = normalizeRelativePath(root, file);

  return {
    id: routePath,
    path: routePath,
    modulePath: relativeModulePath,
  };
}

export async function discoverLayoutFromFile(
  root: string,
  file: string,
): Promise<DiscoveredLayout | null> {
  const source = await readFile(file, "utf8");
  const match = source.match(
    /export\s+const\s+layout\s*=\s*defineLayout(?:<[\s\S]*?>)?\(\s*["'`]([^"'`]+)["'`]/,
  );

  if (!match) {
    return null;
  }

  const layoutPath = match[1];

  if (!layoutPath) {
    return null;
  }

  return {
    id: layoutPath,
    path: layoutPath,
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
  const pathMatch = source.match(
    /export\s+const\s+resource\s*=\s*defineResource(?:<[\s\S]*?>)?\(\s*["'`]([^"'`]+)["'`]/,
  );

  if (!pathMatch) {
    return null;
  }

  const resourcePath = pathMatch[1];

  if (!resourcePath) {
    return null;
  }

  return {
    path: resourcePath,
    modulePath: normalizeRelativePath(root, file),
    hasLoader: /\bloader\s*:/.test(source),
    hasAction: /\baction\s*:/.test(source),
    hasComponent: /\bcomponent\s*:/.test(source),
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
  const match = source.match(
    /export\s+const\s+api\s*=\s*defineApiRoute(?:<[\s\S]*?>)?\(\s*["'`]([^"'`]+)["'`]/,
  );

  if (!match) {
    return null;
  }

  const apiPath = match[1];

  if (!apiPath) {
    return null;
  }

  return {
    path: apiPath,
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
    const importPath = toImportSpecifier(root, route.modulePath);

    return [
      `  {`,
      `    id: ${JSON.stringify(route.id)},`,
      `    path: ${JSON.stringify(route.path)},`,
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
function injectServerManifestIntoServerEntry(filePath: string, source: string): string | null {
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

function normalizeRelativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function toImportSpecifier(root: string, relativeModulePath: string): string {
  const absolutePath = path.resolve(root, relativeModulePath);
  return `/@fs/${absolutePath.split(path.sep).join("/")}`;
}

function toProjectImportSpecifier(relativeModulePath: string): string {
  return `/${relativeModulePath}`;
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

export async function handleLitzResourceRequest(
  server: ViteDevServer,
  manifest: DiscoveredResource[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  if (!request.url?.startsWith("/_litzjs/resource")) {
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
      sendLitzJson(response, 404, { kind: "error", message: "Resource not found." });
      return;
    }

    const module = await loadLitzServerModule<{
      resource?: {
        loader?: (context: unknown) => Promise<unknown>;
        action?: (context: unknown) => Promise<unknown>;
        middleware?: DevMiddlewareHandler<unknown, unknown>[];
      };
    }>(server, toImportSpecifier(server.config.root, entry.modulePath));
    const resource = module.resource as
      | {
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
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

    if (!handler) {
      sendLitzJson(response, 405, {
        kind: "error",
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
      execute(nextContext) {
        return handler({
          request: normalizedRequest.request,
          params: normalizedRequest.params,
          signal,
          context: nextContext,
        });
      },
    });

    await sendServerResult(server, response, result, `${entry.path}#${operation}`);
  } catch (error) {
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
): Promise<void> {
  if (!request.url?.startsWith("/_litzjs/route") && !request.url?.startsWith("/_litzjs/action")) {
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
    const operation =
      body.operation ?? (request.url.startsWith("/_litzjs/action") ? "action" : "loader");
    const entry = manifest.find((route) => route.path === routePath);

    if (!routePath || !entry) {
      sendLitzJson(response, 404, { kind: "error", message: "Route not found." });
      return;
    }

    const module = await loadLitzServerModule<{
      layout?: {
        id: string;
        path: string;
        options?: {
          layout?: unknown;
          loader?: (context: unknown) => Promise<unknown>;
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
              middleware?: DevMiddlewareHandler<unknown, unknown>[];
            };
          };
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
    }>(server, toImportSpecifier(server.config.root, entry.modulePath));
    const route = module.route as
      | {
          loader?: (context: unknown) => Promise<unknown>;
          action?: (context: unknown) => Promise<unknown>;
          options?: {
            loader?: (context: unknown) => Promise<unknown>;
            action?: (context: unknown) => Promise<unknown>;
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
    const target =
      operation === "action"
        ? chain[chain.length - 1]
        : findDevTargetRouteMatch(chain, targetId ?? routePath);

    if (!target) {
      sendLitzJson(response, 404, { kind: "error", message: "Route target not found." });
      return;
    }

    const targetIndex = chain.findIndex((candidate) => candidate.id === target.id);
    const handler =
      operation === "action" ? (route.action ?? route.options?.action) : target.loader;

    if (!handler) {
      sendLitzJson(response, 405, {
        kind: "error",
        message: `Route does not define a ${operation}.`,
      });
      return;
    }

    const normalizedRequest = normalizeInternalResourceRequest(
      internalRequest,
      routePath,
      body.request,
      body.payload,
    );
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    const signal = controller.signal;
    const result = await runDevMiddlewareChain({
      middleware: chain.slice(0, targetIndex + 1).flatMap((candidate) => candidate.middleware),
      request: normalizedRequest.request,
      params:
        operation === "action"
          ? normalizedRequest.params
          : (extractRouteLikeParams(target.path, new URL(normalizedRequest.request.url).pathname) ??
            normalizedRequest.params),
      signal,
      context: undefined,
      execute(nextContext) {
        const params =
          operation === "action"
            ? normalizedRequest.params
            : (extractRouteLikeParams(
                target.path,
                new URL(normalizedRequest.request.url).pathname,
              ) ?? normalizedRequest.params);
        return handler({
          request: normalizedRequest.request,
          params,
          signal,
          context: nextContext,
        });
      },
    });

    await sendServerResult(server, response, result, `${target.id}#${operation}`);
  } catch (error) {
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
): Promise<void> {
  const url = request.url ?? "/";

  if (request.method !== "GET" && request.method !== "HEAD") {
    next();
    return;
  }

  if (url.startsWith("/_litzjs/") || url.startsWith("/@") || url.startsWith("/node_modules/")) {
    next();
    return;
  }

  if (path.extname(url)) {
    next();
    return;
  }

  const accept = request.headers.accept ?? "";

  if (!accept.includes("text/html") && !accept.includes("*/*")) {
    next();
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
): Promise<void> {
  const requestUrl = request.url ? new URL(request.url, "http://litzjs.local") : null;

  if (!requestUrl) {
    next();
    return;
  }

  const matched = manifest.find((entry) => matchPathPattern(entry.path, requestUrl.pathname));

  if (!matched) {
    next();
    return;
  }

  try {
    const module = await server.ssrLoadModule(
      toImportSpecifier(server.config.root, matched.modulePath),
    );
    const api = module.api as
      | {
          middleware?: DevMiddlewareHandler<unknown, Response>[];
          methods?: Partial<
            Record<
              ApiRouteMethod,
              (context: {
                request: Request;
                params: Record<string, string>;
                signal: AbortSignal;
                context: unknown;
              }) => Promise<Response> | Response
            >
          >;
        }
      | undefined;

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
      execute(nextContext) {
        return handler({
          request: apiRequest,
          params: matchedParams ?? {},
          signal,
          context: nextContext,
        });
      },
    });

    await writeFetchResponseToNode(response, apiResponse);
  } catch (error) {
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
        search?: Record<string, string>;
      }
    | undefined,
  payload: InternalRequestBody["payload"],
): {
  request: Request;
  params: Record<string, string>;
} {
  const params = requestData?.params ?? {};
  const search = new URLSearchParams(requestData?.search ?? {});
  const url = new URL(originalRequest.url);
  url.pathname = interpolatePath(resourcePath, params);
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

function interpolatePath(pathPattern: string, params: Record<string, string>): string {
  return pathPattern.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = params[key];

    if (value === undefined) {
      throw new Error(`Missing required resource param "${key}" for path "${pathPattern}".`);
    }

    return encodeURIComponent(value);
  });
}

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
          middleware?: DevMiddlewareHandler<unknown, unknown>[];
        };
      };
      loader?: (context: unknown) => Promise<unknown>;
      middleware?: DevMiddlewareHandler<unknown, unknown>[];
    };
  };
}): Array<{
  id: string;
  path: string;
  loader?: (context: unknown) => Promise<unknown>;
  middleware: DevMiddlewareHandler<unknown, unknown>[];
}> {
  const layouts = collectDevLayouts(entry.route.options?.layout);

  return [
    ...layouts.map((layout) => ({
      id: layout.id,
      path: layout.path,
      loader: layout.options?.loader,
      middleware: layout.options?.middleware ?? [],
    })),
    {
      id: entry.id,
      path: entry.path,
      loader: entry.route.loader ?? entry.route.options?.loader,
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

// ── Production Build & Finalization ──────────────────────────────────────────
// Post-build steps: generate the production index.html with hashed asset paths,
// finalize the RSC server bundle into a single deployable index.js, and clean
// up intermediate artifacts produced by the RSC plugin.

type BuildManifestEntry = {
  file: string;
  src?: string;
  isEntry?: boolean;
  css?: string[];
};

async function writeProductionIndexHtml(root: string, clientOutDir: string): Promise<void> {
  const sourceHtmlPath = path.join(root, "index.html");
  const clientManifestPath = path.join(clientOutDir, ".vite", "manifest.json");

  let sourceHtml: string;
  let manifest: Record<string, BuildManifestEntry>;

  try {
    [sourceHtml, manifest] = await Promise.all([
      readFile(sourceHtmlPath, "utf8"),
      readJson<Record<string, BuildManifestEntry>>(clientManifestPath),
    ]);
  } catch {
    return;
  }

  const entry =
    Object.values(manifest).find((item) => item.isEntry) ??
    Object.values(manifest).find((item) => Boolean(item.file));

  if (!entry) {
    return;
  }

  const headTags = (entry.css ?? [])
    .map((cssFile) => `    <link rel="stylesheet" href="/${cssFile}">`)
    .join("\n");
  const scriptTag = `    <script type="module" src="/${entry.file}"></script>`;

  let html = sourceHtml.replace(
    /<script[^>]+type=["']module["'][^>]+src=["'][^"']+["'][^>]*><\/script>\s*/gi,
    "",
  );

  if (headTags) {
    html = html.replace("</head>", `${headTags}\n  </head>`);
  }

  html = html.replace("</body>", `${scriptTag}\n  </body>`);

  await mkdir(clientOutDir, { recursive: true });
  await writeFile(path.join(clientOutDir, "index.html"), html, "utf8");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function removeLegacyBuildArtifacts(outputRootDir: string): Promise<void> {
  await rm(path.join(outputRootDir, "index.html"), { force: true });
}

/**
 * Post-build finalization pipeline:
 * 1. Read the single-file RSC bundle (`index.js`) and assets manifest
 * 2. Inline the manifest by replacing its import with the manifest source
 * 3. Wrap in a server module (or an inline-asset wrapper if `embedAssets`)
 * 4. Write the final `index.js` and clean up RSC plugin artifacts
 *
 * Returns `false` if the manifest import replacement doesn't match — this
 * signals that the RSC plugin hasn't written its artifacts yet, and the
 * caller should retry (see the `closeBundle` hook).
 */
function finalizeServerArtifacts(
  serverOutDir: string,
  clientOutDir: string,
  inlineClientAssets: boolean,
): boolean {
  let rscEntrySource: string;
  let rscAssetsManifestSource: string;
  let documentHtml = "";
  let clientAssets: EmbeddedClientAsset[] = [];

  try {
    rscEntrySource = readFileSync(path.join(serverOutDir, "index.js"), "utf8");
    rscAssetsManifestSource = readFileSync(
      path.join(serverOutDir, "__vite_rsc_assets_manifest.js"),
      "utf8",
    );

    if (inlineClientAssets) {
      documentHtml = readFileSync(path.join(clientOutDir, "index.html"), "utf8");
      clientAssets = collectEmbeddedClientAssets(clientOutDir);
    }
  } catch {
    return false;
  }

  const manifestBindingSource = rscAssetsManifestSource.replace(
    /^export default\s+/,
    "const assetsManifest = ",
  );

  if (manifestBindingSource === rscAssetsManifestSource) {
    return false;
  }

  const inlinedServerSource = rscEntrySource.replace(
    'import assetsManifest from "./__vite_rsc_assets_manifest.js";',
    manifestBindingSource,
  );

  if (inlinedServerSource === rscEntrySource) {
    return false;
  }

  let wrapperSource: string;

  try {
    wrapperSource = inlineClientAssets
      ? createInlineAssetServerWrapper(inlinedServerSource, documentHtml, clientAssets)
      : createServerModuleWrapper(inlinedServerSource);
  } catch {
    return false;
  }

  writeFileSync(path.join(serverOutDir, "index.js"), wrapperSource, "utf8");
  cleanupRscPluginArtifacts(serverOutDir);
  return true;
}

export function cleanupRscPluginArtifacts(serverOutDir: string): void {
  for (const entry of readdirSync(serverOutDir)) {
    if (entry.startsWith("__vite_rsc_")) {
      rmSync(path.join(serverOutDir, entry), { force: true, recursive: true });
    }
  }
}

function createServerModuleWrapper(serverModuleSource: string): string {
  const { source, handlerName } = transformServerModuleSource(serverModuleSource);
  return [source, "", `export default ${handlerName};`, ""].join("\n");
}

/**
 * Strips the default export from the bundled RSC server module and rebinds it
 * to `__litzjsServerHandler` so the wrapper can re-export it. Uses the
 * TypeScript compiler API to handle four export patterns:
 *
 * 1. Named export lists — `export { handler as default }` → extract the binding
 * 2. Export assignments — `export default expr` → `const __litzjsServerHandler = expr`
 * 3. Default function declarations — strip modifiers, keep name, set binding
 * 4. Default class declarations — same treatment as functions
 *
 * If no handler was directly declared (pattern 1), a final `const` binding is
 * appended from the recorded default expression.
 */
export function transformServerModuleSource(serverModuleSource: string): {
  source: string;
  handlerName: string;
} {
  const handlerName = "__litzjsServerHandler";
  const sourceFile = ts.createSourceFile(
    "server/index.js",
    serverModuleSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const transformedStatements: ts.Statement[] = [];
  let defaultBinding: ts.Expression | null = null;
  let handlerDeclared = false;

  const setDefaultBinding = (expression: ts.Expression): void => {
    if (defaultBinding) {
      throw new Error("Expected a single default export in the bundled Litz server module.");
    }

    defaultBinding = expression;
  };

  const createHandlerDeclaration = (expression: ts.Expression): ts.VariableStatement =>
    ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(handlerName),
            undefined,
            undefined,
            expression,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

  const stripExportModifiers = (modifiers: readonly ts.ModifierLike[] | undefined): ts.Modifier[] =>
    (modifiers?.filter(
      (modifier) =>
        modifier.kind !== ts.SyntaxKind.DefaultKeyword &&
        modifier.kind !== ts.SyntaxKind.ExportKeyword,
    ) as ts.Modifier[]) ?? [];

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const remainingElements: ts.ExportSpecifier[] = [];

      for (const element of statement.exportClause.elements) {
        if (element.name.text === "default" && !statement.moduleSpecifier) {
          setDefaultBinding(
            ts.factory.createIdentifier(element.propertyName?.text ?? element.name.text),
          );
          continue;
        }

        remainingElements.push(element);
      }

      if (remainingElements.length === statement.exportClause.elements.length) {
        transformedStatements.push(statement);
        continue;
      }

      if (remainingElements.length > 0) {
        transformedStatements.push(
          ts.factory.updateExportDeclaration(
            statement,
            statement.modifiers,
            statement.isTypeOnly,
            ts.factory.updateNamedExports(statement.exportClause, remainingElements),
            statement.moduleSpecifier,
            statement.attributes,
          ),
        );
      }

      continue;
    }

    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      transformedStatements.push(createHandlerDeclaration(statement.expression));
      handlerDeclared = true;
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      const modifiers = stripExportModifiers(statement.modifiers);
      const isDefaultExport =
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);

      if (!isDefaultExport) {
        transformedStatements.push(statement);
        continue;
      }

      if (statement.name) {
        transformedStatements.push(
          ts.factory.updateFunctionDeclaration(
            statement,
            modifiers,
            statement.asteriskToken,
            statement.name,
            statement.typeParameters,
            statement.parameters,
            statement.type,
            statement.body ?? ts.factory.createBlock([], false),
          ),
        );
        setDefaultBinding(ts.factory.createIdentifier(statement.name.text));
        continue;
      }

      transformedStatements.push(
        createHandlerDeclaration(
          ts.factory.createFunctionExpression(
            modifiers,
            statement.asteriskToken,
            undefined,
            statement.typeParameters,
            statement.parameters,
            statement.type,
            statement.body ?? ts.factory.createBlock([], false),
          ),
        ),
      );
      handlerDeclared = true;
      continue;
    }

    if (ts.isClassDeclaration(statement)) {
      const modifiers = stripExportModifiers(statement.modifiers);
      const isDefaultExport =
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);

      if (!isDefaultExport) {
        transformedStatements.push(statement);
        continue;
      }

      if (statement.name) {
        transformedStatements.push(
          ts.factory.updateClassDeclaration(
            statement,
            modifiers,
            statement.name,
            statement.typeParameters,
            statement.heritageClauses,
            statement.members,
          ),
        );
        setDefaultBinding(ts.factory.createIdentifier(statement.name.text));
        continue;
      }

      transformedStatements.push(
        createHandlerDeclaration(
          ts.factory.createClassExpression(
            modifiers,
            undefined,
            statement.typeParameters,
            statement.heritageClauses,
            statement.members,
          ),
        ),
      );
      handlerDeclared = true;
      continue;
    }

    transformedStatements.push(statement);
  }

  if (!handlerDeclared) {
    if (!defaultBinding) {
      throw new Error("Unable to locate the default export in the bundled Litz server module.");
    }

    const binding = defaultBinding as ts.Expression;
    const alreadyBound = ts.isIdentifier(binding) && binding.text === handlerName;

    if (!alreadyBound) {
      transformedStatements.push(createHandlerDeclaration(binding));
    }
  }

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const transformedSourceFile = ts.factory.updateSourceFile(sourceFile, transformedStatements);
  const transformed = printer.printFile(transformedSourceFile);

  return {
    source: transformed,
    handlerName,
  };
}

/**
 * Generates a self-contained server module for edge runtimes. Embeds all client
 * assets (JS, CSS, images, fonts) and the document HTML as data literals. The
 * generated `handle(request)` function serves static assets directly, returns
 * `index.html` for document requests, and delegates everything else to the RSC
 * server handler.
 */
function createInlineAssetServerWrapper(
  serverModuleSource: string,
  documentHtml: string,
  clientAssets: EmbeddedClientAsset[],
): string {
  const serializedClientAssets = JSON.stringify(clientAssets);
  const serializedDocumentHtml = JSON.stringify(documentHtml);
  const { source, handlerName } = transformServerModuleSource(serverModuleSource);

  return [
    `const LITZ_DOCUMENT_HTML = ${serializedDocumentHtml};`,
    `const LITZ_CLIENT_ASSETS = new Map(${serializedClientAssets}.map((asset) => [asset.path, asset]));`,
    "",
    source,
    "",
    "function __litzjsDecodeBase64(value) {",
    "  if (typeof atob !== 'function') {",
    "    throw new Error('Base64 asset decoding requires global atob.');",
    "  }",
    "",
    "  const binary = atob(value);",
    "  const bytes = new Uint8Array(binary.length);",
    "",
    "  for (let index = 0; index < binary.length; index += 1) {",
    "    bytes[index] = binary.charCodeAt(index);",
    "  }",
    "",
    "  return bytes;",
    "}",
    "",
    "function __litzjsCreateStaticAssetResponse(asset, request) {",
    "  const body = request.method === 'HEAD'",
    "    ? null",
    "    : asset.encoding === 'base64'",
    "      ? __litzjsDecodeBase64(asset.body)",
    "      : asset.body;",
    "",
    "  return new Response(body, {",
    "    status: 200,",
    "    headers: asset.headers,",
    "  });",
    "}",
    "",
    "function __litzjsShouldServeDocument(request, pathname) {",
    "  if (pathname.startsWith('/_litzjs/') || pathname.startsWith('/api/')) {",
    "    return false;",
    "  }",
    "",
    "  const lastSegment = pathname.split('/').at(-1) ?? '';",
    "",
    "  if (lastSegment.includes('.')) {",
    "    return pathname === '/index.html';",
    "  }",
    "",
    "  const accept = request.headers.get('accept') ?? '';",
    "  return accept.includes('text/html') || accept.includes('*/*');",
    "}",
    "",
    "async function handle(request) {",
    "  const url = new URL(request.url);",
    "  const asset = LITZ_CLIENT_ASSETS.get(url.pathname);",
    "",
    "  if ((request.method === 'GET' || request.method === 'HEAD') && asset) {",
    "    return __litzjsCreateStaticAssetResponse(asset, request);",
    "  }",
    "",
    "  if ((request.method === 'GET' || request.method === 'HEAD') && __litzjsShouldServeDocument(request, url.pathname)) {",
    "    return new Response(request.method === 'HEAD' ? null : LITZ_DOCUMENT_HTML, {",
    "      status: 200,",
    "      headers: {",
    "        'content-type': 'text/html; charset=utf-8',",
    "      },",
    "    });",
    "  }",
    "",
    `  return ${handlerName}.fetch(request);`,
    "}",
    "",
    "export default { fetch: handle };",
    "",
  ].join("\n");
}

// ── Asset Embedding ──────────────────────────────────────────────────────────
// When `embedAssets` is enabled, these helpers collect all client build artifacts
// (JS, CSS, images, fonts) and encode them into the server bundle so that it can
// serve static assets without a separate file server — useful for edge runtimes.

type EmbeddedClientAsset = {
  path: string;
  headers: Record<string, string>;
  body: string;
  encoding: "utf8" | "base64";
};

function collectEmbeddedClientAssets(clientOutDir: string): EmbeddedClientAsset[] {
  const assets: EmbeddedClientAsset[] = [];

  walkClientAssets(clientOutDir, clientOutDir, assets);

  return assets;
}

function walkClientAssets(
  rootDir: string,
  currentDir: string,
  assets: EmbeddedClientAsset[],
): void {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");

    if (relativePath === ".vite" || relativePath.startsWith(".vite/")) {
      continue;
    }

    if (entry.isDirectory()) {
      walkClientAssets(rootDir, fullPath, assets);
      continue;
    }

    if (relativePath === "index.html") {
      continue;
    }

    const buffer = readFileSync(fullPath);
    const encoding = isUtf8Asset(relativePath) ? "utf8" : "base64";
    assets.push({
      path: `/${relativePath}`,
      headers: {
        "content-type": getContentType(relativePath),
      },
      body: encoding === "utf8" ? buffer.toString("utf8") : buffer.toString("base64"),
      encoding,
    });
  }
}

function isUtf8Asset(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();

  return (
    extension === ".js" ||
    extension === ".mjs" ||
    extension === ".css" ||
    extension === ".html" ||
    extension === ".json" ||
    extension === ".svg" ||
    extension === ".txt" ||
    extension === ".map"
  );
}

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
