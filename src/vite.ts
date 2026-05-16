/**
 * Litz Vite plugin.
 *
 * Orchestrates a multi-environment build (RSC -> client -> SSR), registers dev
 * server middleware for route/resource/API handling, and finalizes production
 * artifacts into a single-file server bundle.
 */
import type { InlineConfig, Plugin, PluginOption } from "vite";

import vitePluginRsc from "@vitejs/plugin-rsc";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import ts from "typescript";
import { createBuilder } from "vite";

import type {
  DiscoveredApiRoute,
  DiscoveredLayout,
  DiscoveredResource,
  DiscoveredRoute,
  LitzPluginOptions,
  LitzRouteRule,
} from "./vite/types";

import { normalizeBasePath } from "./base-path";
import { createClientModuleProjection } from "./client-projection";
import { sortByPathSpecificity } from "./path-matching";
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
  LITZ_BROWSER_ENTRY_ID,
  LITZ_RSC_ENTRY_ID,
  LITZ_RSC_RENDERER_ID,
  RESOLVED_LITZ_BROWSER_ENTRY_ID,
  RESOLVED_LITZ_RSC_ENTRY_ID,
  RESOLVED_LITZ_RSC_RENDERER_ID,
  RESOLVED_RESOURCE_MANIFEST_ID,
  RESOLVED_ROUTE_MANIFEST_ID,
  RESOURCE_MANIFEST_ID,
  ROUTE_MANIFEST_ID,
} from "./vite/virtual-ids";
import {
  createClientProjectedFileSet,
  createResourceManifestModule,
  createRouteManifestModule,
  createServerManifestModule,
  normalizeViteModuleId,
} from "./vite/virtual-modules";

export type { LitzPluginOptions, LitzRouteRule };
export {
  discoverAllManifests,
  discoverApiRouteFromFile,
  discoverLayoutFromFile,
  discoverResourceFromFile,
  discoverRouteFromFile,
  handleLitzApiRequest,
  handleLitzDocumentRequest,
  handleLitzResourceRequest,
  handleLitzRouteRequest,
};

type LitzSourceMap = {
  readonly version: 3;
  readonly sources: string[];
  readonly sourcesContent: string[];
  readonly names: string[];
  readonly mappings: string;
};

type ServerRuntimeTransformResult = {
  readonly code: string;
  readonly map: LitzSourceMap;
};

/**
 * Creates the Litz Vite plugin stack. Returns the `@vitejs/plugin-rsc` plugins
 * and the core Litz plugin. Mutable state is populated during `configResolved`
 * and kept in sync during dev via file watching.
 */
export function litz(options: LitzPluginOptions = {}): PluginOption {
  let root = process.cwd();
  let configuredBase = "/";
  let baseOutDir = "dist";
  const browserEntryPath = options.clientEntry ?? "src/main.tsx";
  const configuredServerEntryPath = options.server;
  let serverEntryPath: string | null = null;
  let routeManifest: DiscoveredRoute[] = [];
  let layoutManifest: DiscoveredLayout[] = [];
  let resourceManifest: DiscoveredResource[] = [];
  let apiManifest: DiscoveredApiRoute[] = [];
  let clientProjectedFiles = new Set<string>();
  const routePatterns = [
    "src/routes/**/*.{ts,tsx,js,jsx}",
    "!src/routes/api/**/*.{ts,tsx,js,jsx}",
    "!src/routes/resources/**/*.{ts,tsx,js,jsx}",
  ];
  const resourcePatterns = ["src/routes/resources/**/*.{ts,tsx,js,jsx}"];
  const apiPatterns = ["src/routes/api/**/*.{ts,tsx,js,jsx}"];
  const rscPlugins = configuredServerEntryPath
    ? vitePluginRsc({
        ...options.rsc,
        entries: {
          client: LITZ_BROWSER_ENTRY_ID,
          rsc: LITZ_RSC_ENTRY_ID,
        },
        serverHandler: false,
      })
    : [];

  const litzPlugin: Plugin = {
    name: "litzjs/vite",

    config(userConfig) {
      baseOutDir = userConfig.build?.outDir ?? "dist";

      return {
        environments: {
          client: {
            build: {
              outDir: path.join(baseOutDir, "client"),
              manifest: true,
              rollupOptions: {
                input: {
                  index: LITZ_BROWSER_ENTRY_ID,
                },
              },
            },
          },
          ...(configuredServerEntryPath
            ? {
                rsc: {
                  build: {
                    outDir: path.join(baseOutDir, "server"),
                    manifest: true,
                    rollupOptions: {
                      output: {
                        entryFileNames: "index.mjs",
                      },
                    },
                  },
                },
              }
            : {}),
        },
      };
    },

    async configResolved(config) {
      root = config.root;
      configuredBase = normalizeBasePath(config.base);
      serverEntryPath = resolveConfiguredServerEntry(root, configuredServerEntryPath);

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
      if (configuredServerEntryPath && id === LITZ_RSC_ENTRY_ID) return RESOLVED_LITZ_RSC_ENTRY_ID;
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

      if (configuredServerEntryPath && id === RESOLVED_LITZ_RSC_ENTRY_ID) {
        if (!serverEntryPath) {
          throw new Error("[litzjs] Server entry was not resolved before loading the RSC entry.");
        }

        return createGeneratedServerEntryModule(serverEntryPath);
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

    buildApp: {
      order: "post",
      async handler() {
        finalizeFrameworkBuild(
          root,
          baseOutDir,
          configuredBase,
          Boolean(configuredServerEntryPath),
        );
      },
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

      if (serverEntryPath && this.environment.name !== "client") {
        const relativeId = path.isAbsolute(cleanId)
          ? normalizeRelativePath(root, cleanId)
          : cleanId;

        if (relativeId === serverEntryPath) {
          const transformed = injectServerRuntimeOptions(
            code,
            id,
            root,
            configuredBase,
            createServerManifestModule(routeManifest, resourceManifest, apiManifest),
          );

          return transformed;
        }
      }

      if (this.environment.name !== "client" || !clientProjectedFiles.has(cleanId)) {
        return null;
      }

      const projected = createClientModuleProjection(cleanId, code);

      return projected ? { code: projected, map: null } : null;
    },
  };

  return [...rscPlugins, litzPlugin] as Plugin[];
}

function createGeneratedServerEntryModule(serverEntryPath: string): string {
  return `export { default } from ${JSON.stringify(toProjectImportSpecifier(serverEntryPath))};`;
}

function resolveConfiguredServerEntry(
  root: string,
  configuredPath: string | undefined,
): string | null {
  if (!configuredPath) {
    return null;
  }

  const absolutePath = path.resolve(root, configuredPath);

  if (!existsSync(absolutePath)) {
    throw new Error(
      `[litzjs] Configured server entry "${configuredPath}" does not exist. Either create the file or omit litz({ server }) for a client-only build.`,
    );
  }

  return normalizeRelativePath(root, absolutePath);
}

function injectServerRuntimeOptions(
  code: string,
  id: string,
  root: string,
  base: string,
  serverManifestModule: string,
): ServerRuntimeTransformResult | null {
  const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, getScriptKind(id));
  const createServerIdentifiers = new Set<string>();
  const createServerNamespaces = new Set<string>();
  let referencesCreateServer = false;
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  const runtimeSource = createInlineServerRuntime(root, base, serverManifestModule);

  const visitImports = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "litzjs/server"
    ) {
      const importClause = node.importClause;

      if (importClause?.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          createServerNamespaces.add(importClause.namedBindings.name.text);
        } else {
          for (const element of importClause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;

            if (importedName === "createServer") {
              createServerIdentifiers.add(element.name.text);
            }
          }
        }
      }
    }

    ts.forEachChild(node, visitImports);
  };

  visitImports(sourceFile);

  const isCreateServerExpression = (expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression) && createServerIdentifiers.has(expression.text)) {
      return true;
    }

    return (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === "createServer" &&
      ts.isIdentifier(expression.expression) &&
      createServerNamespaces.has(expression.expression.text)
    );
  };

  const visitCalls = (node: ts.Node) => {
    if (ts.isIdentifier(node) && createServerIdentifiers.has(node.text)) {
      referencesCreateServer = true;
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "createServer" &&
      ts.isIdentifier(node.expression) &&
      createServerNamespaces.has(node.expression.text)
    ) {
      referencesCreateServer = true;
    }

    if (ts.isCallExpression(node) && isCreateServerExpression(node.expression)) {
      referencesCreateServer = true;

      if (node.arguments.length === 0) {
        replacements.push({
          start: node.getEnd() - 1,
          end: node.getEnd() - 1,
          text: "{ base: __litzjsBase, document: __litzjsCreateDocumentResponse, manifest: __litzjsServerManifest }",
        });
      } else if (node.arguments.length === 1 && ts.isObjectLiteralExpression(node.arguments[0]!)) {
        const optionsArgument = node.arguments[0]!;
        const manifestInjection = hasObjectProperty(optionsArgument, "app")
          ? ""
          : " manifest: __litzjsServerManifest,";
        replacements.push({
          start: optionsArgument.getStart() + 1,
          end: optionsArgument.getStart() + 1,
          text: ` base: __litzjsBase, document: __litzjsCreateDocumentResponse,${manifestInjection}`,
        });
      } else {
        throw new Error(
          [
            "[litzjs] Could not inject route manifest options into this custom server entry.",
            "Call createServer() with no arguments or with an inline object literal so Litz can add base, document, and manifest options.",
          ].join(" "),
        );
      }
    }

    ts.forEachChild(node, visitCalls);
  };

  visitCalls(sourceFile);

  if (replacements.length === 0) {
    if (referencesCreateServer) {
      throw new Error(
        [
          "[litzjs] Could not find a direct createServer(...) call to inject in this custom server entry.",
          "Export createServer() or createServer({ ... }) directly from the configured server entry.",
        ].join(" "),
      );
    }

    return null;
  }

  let transformed = code;

  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    transformed =
      transformed.slice(0, replacement.start) +
      replacement.text +
      transformed.slice(replacement.end);
  }

  return {
    code: `${runtimeSource}${transformed}`,
    map: createLineOffsetSourceMap(id, code, countLines(runtimeSource)),
  };
}

function hasObjectProperty(objectLiteral: ts.ObjectLiteralExpression, name: string): boolean {
  return objectLiteral.properties.some((property) => {
    if (ts.isShorthandPropertyAssignment(property)) {
      return property.name.text === name;
    }

    if (!ts.isPropertyAssignment(property)) {
      return false;
    }

    const propertyName = property.name;

    if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
      return propertyName.text === name;
    }

    return false;
  });
}

function getScriptKind(id: string): ts.ScriptKind {
  if (/\.tsx$/i.test(id)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(id)) return ts.ScriptKind.JSX;
  if (/\.ts$/i.test(id)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function countLines(source: string): number {
  return source === "" ? 0 : source.split("\n").length - 1;
}

function createLineOffsetSourceMap(id: string, source: string, lineOffset: number): LitzSourceMap {
  const lineCount = source.split("\n").length;
  const mappings = [
    ...Array.from({ length: lineOffset }, () => ""),
    ...Array.from({ length: lineCount }, (_, index) =>
      encodeVlqSegments(index === 0 ? [0, 0, 0, 0] : [0, 0, 1, 0]),
    ),
  ].join(";");

  return {
    version: 3,
    sources: [id],
    sourcesContent: [source],
    names: [],
    mappings,
  };
}

function encodeVlqSegments(values: number[]): string {
  return values.map(encodeVlqValue).join("");
}

function encodeVlqValue(value: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let encoded = "";

  do {
    let digit = vlq & 31;
    vlq >>>= 5;

    if (vlq > 0) {
      digit |= 32;
    }

    encoded += chars[digit];
  } while (vlq > 0);

  return encoded;
}

function createInlineServerRuntime(
  root: string,
  base: string,
  serverManifestModule: string,
): string {
  return [
    serverManifestModule
      .replace("export const serverManifest =", "const __litzjsServerManifest =")
      .trimStart(),
    `const __litzjsBase = ${JSON.stringify(base)};`,
    `const __litzjsDocumentTemplate = ${JSON.stringify(readDocumentTemplate(root))};`,
    `const __litzjsClientEntry = "__LITZJS_CLIENT_ENTRY__";`,
    `const __litzjsClientStyles = "__LITZJS_CLIENT_STYLES__";`,
    "",
    "function __litzjsJoinBase(base, pathname) {",
    '  const normalizedBase = base === "/" ? "" : base.replace(/\\/$/, "");',
    '  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;',
    '  return `${normalizedBase}${normalizedPathname}` || "/";',
    "}",
    "",
    "function __litzjsStripDevModuleScripts(html) {",
    '  return html.replace(/<script\\b(?=[^>]*\\btype=["\']module["\'])(?=[^>]*\\bsrc=["\'][^"\']+["\'])[^>]*>\\s*<\\/script>/gi, "");',
    "}",
    "",
    "function __litzjsCreateDocumentResponse(request) {",
    '  if (request.method !== "GET" && request.method !== "HEAD") return null;',
    '  const accept = request.headers.get("accept") ?? "";',
    '  if (!accept.includes("text/html") && !accept.includes("*/*")) return null;',
    '  const script = __litzjsClientEntry ? `<script type="module" src="${__litzjsJoinBase(__litzjsBase, __litzjsClientEntry)}"></script>` : "";',
    '  const styles = __litzjsClientStyles ? __litzjsClientStyles.split(",").map((href) => `<link rel="stylesheet" crossorigin href="${__litzjsJoinBase(__litzjsBase, href)}">`).join("\\n") : "";',
    "  const html = __litzjsStripDevModuleScripts(__litzjsDocumentTemplate).replace(/<\\/head>/i, `${styles}\\n  </head>`).replace(/<\\/body>/i, `${script}\\n  </body>`);",
    '  return new Response(request.method === "HEAD" ? null : html, {',
    "    status: 200,",
    '    headers: { "content-type": "text/html; charset=utf-8" },',
    "  });",
    "}",
    "",
  ].join("\n");
}

function readDocumentTemplate(root: string): string {
  const templatePath = path.resolve(root, "index.html");

  if (!existsSync(templatePath)) {
    return '<!doctype html><html><head><meta charset="UTF-8" /></head><body><div id="app"></div></body></html>';
  }

  return readFileSync(templatePath, "utf8");
}

function finalizeFrameworkBuild(
  root: string,
  outDir: string,
  base: string,
  hasServerEntry: boolean,
): void {
  if (!hasServerEntry) {
    return;
  }

  const distDir = path.resolve(root, outDir);
  const clientDir = path.join(distDir, "client");
  const ssrDir = path.join(distDir, "ssr");
  const serverEntryPath = path.join(distDir, "server", "index.mjs");
  const clientManifestPath = path.join(clientDir, ".vite", "manifest.json");

  if (existsSync(ssrDir)) {
    rmSync(ssrDir, { force: true, recursive: true });
  }

  if (!existsSync(serverEntryPath) || !existsSync(clientManifestPath)) {
    return;
  }

  const clientManifest = JSON.parse(readFileSync(clientManifestPath, "utf8")) as Record<
    string,
    { css?: string[]; file?: string; isEntry?: boolean }
  >;
  const relativePrefix = path
    .relative(path.dirname(clientManifestPath), distDir)
    .replaceAll("\\", "/");
  const browserEntryManifestKey = `${relativePrefix}/virtual:litzjs:browser-entry`;
  const entry =
    clientManifest[browserEntryManifestKey] ??
    Object.entries(clientManifest).find(([key]) =>
      key.endsWith("virtual:litzjs:browser-entry"),
    )?.[1] ??
    Object.values(clientManifest).find((candidate) => candidate?.isEntry);

  if (!entry?.file) {
    return;
  }

  const clientEntry = entry.file.replaceAll("\\", "/");
  const clientStyles = (entry.css ?? []).map((cssFile) => cssFile.replaceAll("\\", "/"));
  const serverCode = readFileSync(serverEntryPath, "utf8");

  writeFileSync(
    path.join(clientDir, "index.html"),
    createProductionDocumentHtml(root, base, clientEntry, clientStyles),
    "utf8",
  );

  writeFileSync(
    serverEntryPath,
    serverCode
      .replaceAll("__LITZJS_CLIENT_ENTRY__", clientEntry)
      .replaceAll("__LITZJS_CLIENT_STYLES__", clientStyles.join(",")),
    "utf8",
  );
}

function createProductionDocumentHtml(
  root: string,
  base: string,
  clientEntry: string,
  clientStyles: string[],
): string {
  const script = clientEntry
    ? `<script type="module" src="${joinProductionBase(base, clientEntry)}"></script>`
    : "";
  const styles = clientStyles
    .map((href) => `<link rel="stylesheet" crossorigin href="${joinProductionBase(base, href)}">`)
    .join("\n");

  return stripProductionModuleScripts(readDocumentTemplate(root))
    .replace(/<\/head>/i, `${styles}\n  </head>`)
    .replace(/<\/body>/i, `${script}\n  </body>`);
}

function joinProductionBase(base: string, pathname: string): string {
  const normalizedBase = base === "/" ? "" : base.replace(/\/$/, "");
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return `${normalizedBase}${normalizedPathname}` || "/";
}

function stripProductionModuleScripts(html: string): string {
  return html.replace(
    /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["'][^"']+["'])[^>]*>\s*<\/script>/gi,
    "",
  );
}

export async function buildLitzApp(inlineConfig: InlineConfig = {}): Promise<void> {
  const builder = await createBuilder(inlineConfig, false);
  await builder.buildApp();
}
