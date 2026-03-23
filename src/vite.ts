import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import type { Connect, Plugin, ViteDevServer } from "vite";

import vitePluginRsc from "@vitejs/plugin-rsc";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import ts from "typescript";

import type { ApiRouteMethod } from "./index";

import { createClientModuleProjection } from "./client-projection";
import { extractRouteLikeParams, matchPathname, sortByPathSpecificity } from "./path-matching";
import { parseInternalRequestBody, type InternalRequestBody } from "./server/internal-requests";
import { createInternalHandlerHeaders } from "./server/request-headers";

export type VoltPluginOptions = {
  routes?: string[];
  api?: string[];
  resources?: string[];
  server?: string;
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

const ROUTE_MANIFEST_ID = "virtual:volt:route-manifest";
const RESOLVED_ROUTE_MANIFEST_ID = "\0virtual:volt:route-manifest";
const RESOURCE_MANIFEST_ID = "virtual:volt:resource-manifest";
const RESOLVED_RESOURCE_MANIFEST_ID = "\0virtual:volt:resource-manifest";
const SERVER_MANIFEST_ID = "virtual:volt:server-manifest";
const RESOLVED_SERVER_MANIFEST_ID = "\0virtual:volt:server-manifest";
const VOLT_RSC_ENTRY_ID = "virtual:volt:rsc-entry";
const RESOLVED_VOLT_RSC_ENTRY_ID = "\0virtual:volt:rsc-entry";
const VOLT_BROWSER_ENTRY_ID = "virtual:volt:browser-entry";
const RESOLVED_VOLT_BROWSER_ENTRY_ID = "\0virtual:volt:browser-entry";
const VOLT_RSC_RENDERER_ID = "virtual:volt:rsc-renderer";
const RESOLVED_VOLT_RSC_RENDERER_ID = "\0virtual:volt:rsc-renderer";
let hasScheduledServerCleanup = false;

export default function volt(options: VoltPluginOptions = {}): Plugin[] {
  let root = process.cwd();
  let browserEntryPath = "src/main.tsx";
  let serverEntryPath: string | null = null;
  let serverEntryFilePath: string | null = null;
  let outputRootDir = path.resolve(root, "dist");
  let clientOutDir = path.resolve(root, "dist/client");
  let serverOutDir = path.resolve(root, "dist/server");
  let serverRscOutDir = path.resolve(root, "dist/server/_rsc");
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
  const rscPlugins = vitePluginRsc({
    entries: {
      client: VOLT_BROWSER_ENTRY_ID,
      rsc: VOLT_RSC_ENTRY_ID,
    },
    serverHandler: false,
  });

  const voltPlugin: Plugin = {
    name: "volt/vite",

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
              outDir: path.join(baseOutDir, "server", "_rsc"),
            },
          },
          ssr: {
            build: {
              outDir: path.join(baseOutDir, "server", "_ssr"),
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
      serverOutDir = path.resolve(root, path.join(config.build.outDir || "dist", "server"));
      serverRscOutDir = path.resolve(
        root,
        config.environments.rsc?.build.outDir || path.join("dist", "server", "_rsc"),
      );
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

      if (id === VOLT_RSC_ENTRY_ID) {
        return RESOLVED_VOLT_RSC_ENTRY_ID;
      }

      if (id === VOLT_BROWSER_ENTRY_ID) {
        return RESOLVED_VOLT_BROWSER_ENTRY_ID;
      }

      if (id === VOLT_RSC_RENDERER_ID) {
        return RESOLVED_VOLT_RSC_RENDERER_ID;
      }

      return null;
    },

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

      if (id === RESOLVED_VOLT_RSC_ENTRY_ID) {
        if (serverEntryPath) {
          return `export { default } from ${JSON.stringify(toProjectImportSpecifier(serverEntryPath))};`;
        }

        return `
import { createServer } from "volt/server";
import { serverManifest } from ${JSON.stringify(SERVER_MANIFEST_ID)};

export default createServer({
  manifest: serverManifest,
  createContext() {
    return undefined;
  },
});
`;
      }

      if (id === RESOLVED_VOLT_BROWSER_ENTRY_ID) {
        return `import ${JSON.stringify(toImportSpecifier(root, browserEntryPath))};`;
      }

      if (id === RESOLVED_VOLT_RSC_RENDERER_ID) {
        return `
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";

export async function renderView(node, metadata = {}) {
  const stream = renderToReadableStream(node);
  return new Response(stream, {
    status: metadata.status ?? 200,
    headers: {
      "content-type": "text/x-component",
      "x-volt-kind": "view",
      "x-volt-status": String(metadata.status ?? 200),
      "x-volt-view-id": metadata.viewId ?? "volt#view",
      "x-volt-revalidate": Array.isArray(metadata.revalidate) ? metadata.revalidate.join(",") : ""
    }
  });
}
`;
      }

      return null;
    },

    configureServer(server) {
      const refreshManifests = async (changedFile?: string) => {
        if (changedFile && !/\.(ts|tsx)$/.test(changedFile)) {
          return;
        }

        const next = await discoverAllManifests(root, routePatterns, resourcePatterns, apiPatterns);
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

        if (!changed) {
          return;
        }

        invalidateVirtualModule(server, RESOLVED_ROUTE_MANIFEST_ID);
        invalidateVirtualModule(server, RESOLVED_RESOURCE_MANIFEST_ID);
        server.ws.send({ type: "full-reload" });
      };

      const onFsChange = (file: string) => {
        void refreshManifests(file);
      };

      server.watcher.on("add", onFsChange);
      server.watcher.on("change", onFsChange);
      server.watcher.on("unlink", onFsChange);

      server.middlewares.use((request, response, next) => {
        void handleVoltResourceRequest(server, resourceManifest, request, response, next);
      });
      server.middlewares.use((request, response, next) => {
        void handleVoltRouteRequest(server, routeManifest, request, response, next);
      });
      server.middlewares.use((request, response, next) => {
        void handleVoltApiRequest(server, apiManifest, request, response, next);
      });
      server.middlewares.use((request, response, next) => {
        void handleVoltDocumentRequest(server, request, response, next);
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

    async closeBundle() {
      await Promise.all([
        writeProductionIndexHtml(root, clientOutDir),
        removeLegacyBuildArtifacts(outputRootDir),
      ]);

      scheduleServerArtifactFinalization(
        serverOutDir,
        serverRscOutDir,
        clientOutDir,
        !serverEntryPath,
      );
    },
  };

  return [...rscPlugins, voltPlugin];
}

async function discoverAllManifests(
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

async function discoverServerEntry(root: string, configuredPath?: string): Promise<string | null> {
  const candidate = configuredPath ?? "src/server/index.ts";
  const absolutePath = path.resolve(root, candidate);

  return ts.sys.fileExists(absolutePath) ? normalizeRelativePath(root, absolutePath) : null;
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

async function discoverRouteFromFile(root: string, file: string): Promise<DiscoveredRoute | null> {
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

async function discoverLayoutFromFile(
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

async function discoverResourceFromFile(
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

async function discoverApiRouteFromFile(
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
      path.resolve(root, "modulePath" in entry ? entry.modulePath : ""),
    ),
  );
}

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

    if (statement.moduleSpecifier.text !== "volt/server") {
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
              ts.factory.createIdentifier("__voltMergeServerOptions"),
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
          ts.factory.createIdentifier("__voltServerManifest"),
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
          ts.factory.createIdentifier("__voltMergeServerOptions"),
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
                    ts.factory.createIdentifier("__voltServerManifest"),
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

async function handleVoltResourceRequest(
  server: ViteDevServer,
  manifest: DiscoveredResource[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  if (!request.url?.startsWith("/_volt/resource")) {
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
      sendVoltJson(response, 404, { kind: "error", message: "Resource not found." });
      return;
    }

    const module = await loadVoltServerModule<{
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
      sendVoltJson(response, 500, {
        kind: "fault",
        message: "Resource module did not export resource.",
      });
      return;
    }

    const handler = operation === "action" ? resource.action : resource.loader;

    if (!handler) {
      sendVoltJson(response, 405, {
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
    const signal = new AbortController().signal;
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
    sendVoltJson(response, 500, {
      kind: "fault",
      message: error instanceof Error ? error.message : "Resource request failed.",
    });
  }
}

async function handleVoltRouteRequest(
  server: ViteDevServer,
  manifest: DiscoveredRoute[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  if (!request.url?.startsWith("/_volt/route") && !request.url?.startsWith("/_volt/action")) {
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
      body.operation ?? (request.url.startsWith("/_volt/action") ? "action" : "loader");
    const entry = manifest.find((route) => route.path === routePath);

    if (!routePath || !entry) {
      sendVoltJson(response, 404, { kind: "error", message: "Route not found." });
      return;
    }

    const module = await loadVoltServerModule<{
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
      sendVoltJson(response, 500, { kind: "fault", message: "Route module did not export route." });
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
      sendVoltJson(response, 404, { kind: "error", message: "Route target not found." });
      return;
    }

    const targetIndex = chain.findIndex((candidate) => candidate.id === target.id);
    const handler =
      operation === "action" ? (route.action ?? route.options?.action) : target.loader;

    if (!handler) {
      sendVoltJson(response, 405, {
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
    const signal = new AbortController().signal;
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
    sendVoltJson(response, 500, {
      kind: "fault",
      message: error instanceof Error ? error.message : "Route request failed.",
    });
  }
}

async function handleVoltDocumentRequest(
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

  if (url.startsWith("/_volt/") || url.startsWith("/@") || url.startsWith("/node_modules/")) {
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

async function handleVoltApiRequest(
  server: ViteDevServer,
  manifest: DiscoveredApiRoute[],
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  const requestUrl = request.url ? new URL(request.url, "http://volt.local") : null;

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

    const signal = new AbortController().signal;
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
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : "API route failed.");
  }
}

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

  return new URL(request.url ?? "/", `${protocol}://${host ?? "volt.local"}`);
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
  viewId = "volt#view",
): Promise<void> {
  if (!result || typeof result !== "object" || !("kind" in result)) {
    sendVoltJson(response, 500, {
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
      sendVoltJson(response, serverResult.status ?? 200, {
        kind: "data",
        data: serverResult.data,
        revalidate: serverResult.revalidate ?? [],
      });
      return;
    case "invalid":
      sendVoltJson(response, serverResult.status ?? 422, {
        kind: "invalid",
        fields: serverResult.fields,
        formError: serverResult.formError,
        data: serverResult.data,
      });
      return;
    case "redirect":
      sendVoltJson(response, serverResult.status ?? 303, {
        kind: "redirect",
        location: serverResult.location,
        replace: serverResult.replace ?? false,
        revalidate: serverResult.revalidate ?? [],
      });
      return;
    case "error":
      sendVoltJson(response, serverResult.status ?? 500, {
        kind: "error",
        message: serverResult.message ?? "Error",
        code: serverResult.code,
        data: serverResult.data,
      });
      return;
    case "fault":
      sendVoltJson(response, serverResult.status ?? 500, {
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
      sendVoltJson(response, 500, {
        kind: "fault",
        message: `Unsupported result kind "${serverResult.kind}".`,
      });
  }
}

async function loadVoltServerModule<T>(server: ViteDevServer, id: string): Promise<T> {
  const environment = getRscEnvironment(server);
  const resolved = await environment.pluginContainer.resolveId(id);

  if (!resolved) {
    throw new Error(`Failed to resolve Volt server module "${id}".`);
  }

  return environment.runner.import(resolved.id);
}

async function loadRscRenderer(server: ViteDevServer): Promise<{
  renderView(
    node: unknown,
    metadata?: { status?: number; viewId?: string; revalidate?: string[] },
  ): Promise<Response>;
}> {
  return loadVoltServerModule(server, VOLT_RSC_RENDERER_ID);
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

function sendVoltJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/vnd.volt.result+json");
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

  response.setHeader("x-volt-revalidate", revalidate.join(","));
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
          throw new Error("Volt middleware next() called multiple times.");
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
  await Promise.all([
    rm(path.join(outputRootDir, "index.html"), { force: true }),
    rm(path.join(outputRootDir, "rsc"), { force: true, recursive: true }),
    rm(path.join(outputRootDir, "ssr"), { force: true, recursive: true }),
  ]);
}

function scheduleServerArtifactFinalization(
  serverOutDir: string,
  serverRscOutDir: string,
  clientOutDir: string,
  inlineClientAssets = true,
): void {
  if (hasScheduledServerCleanup) {
    return;
  }

  hasScheduledServerCleanup = true;
  process.once("beforeExit", () => {
    finalizeServerArtifacts(serverOutDir, serverRscOutDir, clientOutDir, inlineClientAssets);
  });
}

function finalizeServerArtifacts(
  serverOutDir: string,
  serverRscOutDir: string,
  clientOutDir: string,
  inlineClientAssets: boolean,
): void {
  const rscIndexPath = path.join(serverRscOutDir, "index.mjs");
  const rscAssetsManifestPath = path.join(serverRscOutDir, "__vite_rsc_assets_manifest.js");
  let rscEntrySource: string;
  let rscAssetsManifestSource: string;
  let documentHtml = "";
  let clientAssets: EmbeddedClientAsset[] = [];

  try {
    [rscEntrySource, rscAssetsManifestSource] = [
      readFileSync(rscIndexPath, "utf8"),
      readFileSync(rscAssetsManifestPath, "utf8"),
    ];

    if (inlineClientAssets) {
      documentHtml = readFileSync(path.join(clientOutDir, "index.html"), "utf8");
      clientAssets = collectEmbeddedClientAssets(clientOutDir);
    }
  } catch {
    return;
  }

  const manifestBindingSource = rscAssetsManifestSource.replace(
    /^export default\s+/,
    "const assetsManifest = ",
  );
  const asyncLocalStorageShimSource = [
    "class __VoltAsyncLocalStorage {",
    "  run(store, callback, ...args) {",
    "    const previousStore = this.store;",
    "    this.store = store;",
    "    try {",
    "      return callback(...args);",
    "    } finally {",
    "      this.store = previousStore;",
    "    }",
    "  }",
    "",
    "  getStore() {",
    "    return this.store;",
    "  }",
    "",
    "  enterWith(store) {",
    "    this.store = store;",
    "  }",
    "}",
    "",
    "globalThis.AsyncLocalStorage ??= __VoltAsyncLocalStorage;",
  ].join("\n");
  const inlinedServerSource = rscEntrySource
    .replace('import assetsManifest from "./__vite_rsc_assets_manifest.js";', manifestBindingSource)
    .replace(/import \* as __viteRscAsyncHooks from "node:async_hooks";\s*/g, "")
    .replace(/const __viteRscAsyncHooks = require\("node:async_hooks"\);\s*/g, "")
    .replace(
      /globalThis\.AsyncLocalStorage = __viteRscAsyncHooks\.AsyncLocalStorage;/g,
      asyncLocalStorageShimSource,
    );
  const wrapperSource = inlineClientAssets
    ? createInlineAssetServerWrapper(inlinedServerSource, documentHtml, clientAssets)
    : createServerModuleWrapper(inlinedServerSource);

  mkdirSync(serverOutDir, { recursive: true });
  writeFileSync(path.join(serverOutDir, "index.js"), wrapperSource, "utf8");

  rmSync(serverRscOutDir, { force: true, recursive: true });
  rmSync(path.join(serverOutDir, "_ssr"), { force: true, recursive: true });
}

function createServerModuleWrapper(serverModuleSource: string): string {
  const { source, handlerName } = transformServerModuleSource(serverModuleSource);
  return [source, "", `export default ${handlerName};`, ""].join("\n");
}

function transformServerModuleSource(serverModuleSource: string): {
  source: string;
  handlerName: string;
} {
  const handlerName = "__voltServerHandler";
  let transformed = serverModuleSource;

  transformed = transformed.replace(
    /export\s*\{\s*([A-Za-z0-9_$]+)\s+as\s+default\s*\};?\s*$/m,
    `const ${handlerName} = $1;`,
  );

  if (transformed === serverModuleSource) {
    transformed = transformed.replace(
      /export default\s+async function\s+([A-Za-z0-9_$]+)\s*\(/,
      `const ${handlerName} = async function $1(`,
    );
  }

  if (transformed === serverModuleSource) {
    transformed = transformed.replace(
      /export default\s+function\s+([A-Za-z0-9_$]+)\s*\(/,
      `const ${handlerName} = function $1(`,
    );
  }

  if (transformed === serverModuleSource) {
    transformed = transformed.replace(/export default\s+/, `const ${handlerName} = `);
  }

  return {
    source: transformed,
    handlerName,
  };
}

function createInlineAssetServerWrapper(
  serverModuleSource: string,
  documentHtml: string,
  clientAssets: EmbeddedClientAsset[],
): string {
  const serializedClientAssets = JSON.stringify(clientAssets);
  const serializedDocumentHtml = JSON.stringify(documentHtml);
  const { source, handlerName } = transformServerModuleSource(serverModuleSource);

  return [
    `const VOLT_DOCUMENT_HTML = ${serializedDocumentHtml};`,
    `const VOLT_CLIENT_ASSETS = new Map(${serializedClientAssets}.map((asset) => [asset.path, asset]));`,
    "",
    source,
    "",
    "function decodeBase64(value) {",
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
    "function createStaticAssetResponse(asset, request) {",
    "  const body = request.method === 'HEAD'",
    "    ? null",
    "    : asset.encoding === 'base64'",
    "      ? decodeBase64(asset.body)",
    "      : asset.body;",
    "",
    "  return new Response(body, {",
    "    status: 200,",
    "    headers: asset.headers,",
    "  });",
    "}",
    "",
    "function shouldServeDocument(request, pathname) {",
    "  if (pathname.startsWith('/_volt/') || pathname.startsWith('/api/')) {",
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
    "export default async function handle(request) {",
    "  const url = new URL(request.url);",
    "  const asset = VOLT_CLIENT_ASSETS.get(url.pathname);",
    "",
    "  if ((request.method === 'GET' || request.method === 'HEAD') && asset) {",
    "    return createStaticAssetResponse(asset, request);",
    "  }",
    "",
    "  if ((request.method === 'GET' || request.method === 'HEAD') && shouldServeDocument(request, url.pathname)) {",
    "    return new Response(request.method === 'HEAD' ? null : VOLT_DOCUMENT_HTML, {",
    "      status: 200,",
    "      headers: {",
    "        'content-type': 'text/html; charset=utf-8',",
    "      },",
    "    });",
    "  }",
    "",
    `  return ${handlerName}(request);`,
    "}",
    "",
  ].join("\n");
}

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
