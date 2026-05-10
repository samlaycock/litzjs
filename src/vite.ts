/**
 * Litz Vite plugin.
 *
 * Orchestrates a multi-environment build (RSC -> client -> SSR), registers dev
 * server middleware for route/resource/API handling, and finalizes production
 * artifacts into a single-file server bundle.
 */
import type { InlineConfig, Plugin, PluginOption } from "vite";

import vitePluginRsc from "@vitejs/plugin-rsc";
import path from "node:path";
import picomatch from "picomatch";
import { createBuilder } from "vite";

import type {
  DiscoveredApiRoute,
  DiscoveredLayout,
  DiscoveredResource,
  DiscoveredRoute,
  LitzNitroPluginOptions,
  LitzPluginOptions,
  LitzRouteRule,
} from "./vite/types";

import { normalizeBasePath } from "./base-path";
import { createClientModuleProjection } from "./client-projection";
import { sortByPathSpecificity } from "./path-matching";
import { litzNitro } from "./vite-nitro";
import {
  handleLitzApiRequest,
  handleLitzDocumentRequest,
  handleLitzResourceRequest,
  handleLitzRouteRequest,
} from "./vite/dev-middleware";
import {
  discoverAllManifests,
  discoverApiRouteFromFile,
  discoverLayoutFromFile,
  discoverResourceFromFile,
  discoverRouteFromFile,
  discoverServerEntry,
  isClientBoundaryModule,
  isRouteLikeModuleFile,
} from "./vite/discovery";
import { collectClientHotUpdateModules, invalidateVirtualModule } from "./vite/hmr";
import {
  normalizeRelativePath,
  toBrowserImportSpecifier,
  toProjectImportSpecifier,
} from "./vite/paths";
import {
  BASE_ID,
  LITZ_BROWSER_ENTRY_ID,
  LITZ_RSC_ENTRY_ID,
  LITZ_RSC_RENDERER_ID,
  RESOLVED_BASE_ID,
  RESOLVED_LITZ_BROWSER_ENTRY_ID,
  RESOLVED_LITZ_RSC_ENTRY_ID,
  RESOLVED_LITZ_RSC_RENDERER_ID,
  RESOLVED_RESOURCE_MANIFEST_ID,
  RESOLVED_ROUTE_MANIFEST_ID,
  RESOLVED_SERVER_MANIFEST_ID,
  RESOURCE_MANIFEST_ID,
  ROUTE_MANIFEST_ID,
  SERVER_MANIFEST_ID,
} from "./vite/virtual-ids";
import {
  createClientProjectedFileSet,
  createResourceManifestModule,
  createRouteManifestModule,
  createServerManifestModule,
  normalizeViteModuleId,
} from "./vite/virtual-modules";

export type { LitzNitroPluginOptions, LitzPluginOptions, LitzRouteRule };
export {
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
};

/**
 * Creates the Litz Vite plugin stack. Returns the `@vitejs/plugin-rsc` plugins,
 * the core Litz plugin, and the Nitro production adapter by default. Mutable
 * state is populated during `configResolved` and kept in sync during dev via
 * file watching.
 */
export function litz(options: LitzPluginOptions = {}): PluginOption {
  let root = process.cwd();
  let configuredBase = "/";
  const browserEntryPath = options.clientEntry ?? "src/main.tsx";
  let serverEntryPath: string | null = null;
  let routeManifest: DiscoveredRoute[] = [];
  let layoutManifest: DiscoveredLayout[] = [];
  let resourceManifest: DiscoveredResource[] = [];
  let apiManifest: DiscoveredApiRoute[] = [];
  let clientProjectedFiles = new Set<string>();
  const routePatterns = options.routes ?? [
    "src/routes/**/*.{ts,tsx,js,jsx}",
    "!src/routes/api/**/*.{ts,tsx,js,jsx}",
    "!src/routes/resources/**/*.{ts,tsx,js,jsx}",
  ];
  const resourcePatterns = options.resources ?? ["src/routes/resources/**/*.{ts,tsx,js,jsx}"];
  const apiPatterns = options.api ?? ["src/routes/api/**/*.{ts,tsx,js,jsx}"];
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
      serverEntryPath = await discoverServerEntry(root, options.server);

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

    resolveId(id) {
      if (id === ROUTE_MANIFEST_ID) return RESOLVED_ROUTE_MANIFEST_ID;
      if (id === RESOURCE_MANIFEST_ID) return RESOLVED_RESOURCE_MANIFEST_ID;
      if (id === SERVER_MANIFEST_ID) return RESOLVED_SERVER_MANIFEST_ID;
      if (id === BASE_ID) return RESOLVED_BASE_ID;
      if (id === LITZ_RSC_ENTRY_ID) return RESOLVED_LITZ_RSC_ENTRY_ID;
      if (id === LITZ_BROWSER_ENTRY_ID) return RESOLVED_LITZ_BROWSER_ENTRY_ID;
      if (id === LITZ_RSC_RENDERER_ID) return RESOLVED_LITZ_RSC_RENDERER_ID;
      return null;
    },

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

      if (id === RESOLVED_BASE_ID) {
        return `export const base = ${JSON.stringify(configuredBase)};`;
      }

      if (id === RESOLVED_LITZ_RSC_ENTRY_ID) {
        if (serverEntryPath) {
          return `export { default } from ${JSON.stringify(toProjectImportSpecifier(serverEntryPath))};`;
        }

        return `
import { createServer } from "litzjs/server";
import { base } from ${JSON.stringify(BASE_ID)};
import { serverManifest } from ${JSON.stringify(SERVER_MANIFEST_ID)};

export default createServer({
  base,
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
  // Dev-only HMR bridge for Vite updates. Ordinary client runtime state is
  // configured through configureClientRuntime instead of globalThis.
  globalThis.__litzjsViteHot = import.meta.hot;
}

import { configureClientRuntime } from "litzjs/client";
import ${JSON.stringify(toBrowserImportSpecifier(root, browserEntryPath, configuredBase))};

configureClientRuntime({
  baseUrl: ${JSON.stringify(configuredBase)},
});
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

      const refreshClientProjectedFiles = () => {
        clientProjectedFiles = createClientProjectedFileSet(
          root,
          routeManifest,
          layoutManifest,
          resourceManifest,
          apiManifest,
        );
      };

      const flushManifestRefresh = async () => {
        if (!pendingFullDiscovery) {
          return;
        }

        pendingFullDiscovery = false;
        manifestGeneration++;
        const generation = manifestGeneration;
        const next = await discoverAllManifests(root, routePatterns, resourcePatterns, apiPatterns);

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
        refreshClientProjectedFiles();

        if (changed) {
          invalidateVirtualModule(server, RESOLVED_ROUTE_MANIFEST_ID);
          invalidateVirtualModule(server, RESOLVED_RESOURCE_MANIFEST_ID);
          server.ws.send({ type: "full-reload" });
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

        if (isClientBoundaryModule(file)) {
          pendingFullDiscovery = true;
          scheduleRefresh();
          return;
        }

        const generation = manifestGeneration;
        const relativePath = normalizeRelativePath(root, file);
        let changed = false;

        if (isRouteCandidate(relativePath)) {
          const entry = await discoverRouteFromFile(root, file);
          if (manifestGeneration !== generation) return;

          const result = updateManifestEntry(routeManifest, entry, file, (items) =>
            sortByPathSpecificity(items),
          );
          routeManifest = result.manifest;
          changed = changed || result.changed;

          const layoutEntry = await discoverLayoutFromFile(root, file);
          if (manifestGeneration !== generation) return;

          const layoutResult = updateManifestEntry(layoutManifest, layoutEntry, file);
          layoutManifest = layoutResult.manifest;
          changed = changed || layoutResult.changed;
        }

        if (isResourceCandidate(relativePath)) {
          const entry = await discoverResourceFromFile(root, file);
          if (manifestGeneration !== generation) return;

          const result = updateManifestEntry(resourceManifest, entry, file);
          resourceManifest = result.manifest;
          changed = changed || result.changed;
        }

        if (isApiCandidate(relativePath)) {
          const entry = await discoverApiRouteFromFile(root, file);
          if (manifestGeneration !== generation) return;

          const result = updateManifestEntry(apiManifest, entry, file, (items) =>
            sortByPathSpecificity(items),
          );
          apiManifest = result.manifest;
          changed = changed || result.changed;
        }

        if (changed) {
          refreshClientProjectedFiles();
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
        if (!isRouteLikeModuleFile(file)) {
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
        if (!isRouteLikeModuleFile(file)) {
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

      if (!/\.(ts|tsx|js|jsx)$/.test(options.file)) {
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

      if (this.environment.name !== "client" || !clientProjectedFiles.has(cleanId)) {
        return null;
      }

      const projected = createClientModuleProjection(cleanId, code);

      return projected ? { code: projected, map: null } : null;
    },
  };

  const nitroPlugins = options.nitro === false ? [] : (litzNitro(options.nitro) as Plugin[]);

  // The explicit cast prevents a "Plugin<any>[]" leak caused by Nitro's module
  // augmentation when consumers pass the result into defineConfig plugins.
  return [...rscPlugins, litzPlugin, ...nitroPlugins] as Plugin[];
}

export async function buildLitzApp(inlineConfig: InlineConfig = {}): Promise<void> {
  const builder = await createBuilder(inlineConfig, false);
  await builder.buildApp();
}
