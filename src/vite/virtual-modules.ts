import path from "node:path";

import type {
  DiscoveredApiRoute,
  DiscoveredLayout,
  DiscoveredResource,
  DiscoveredRoute,
} from "./types";

import { toBrowserImportSpecifier, toProjectImportSpecifier } from "./paths";

export function createRouteManifestModule(
  manifest: DiscoveredRoute[],
  root: string,
  lazy: boolean,
  base: string,
): string {
  if (!lazy) {
    const imports: string[] = [];
    const lines = manifest.map((route, index) => {
      const importName = `routeModule${index}`;
      const modulePath = route.clientModulePath ?? route.modulePath;
      imports.push(
        `import * as ${importName} from ${JSON.stringify(toProjectImportSpecifier(modulePath))};`,
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
    const modulePath = route.clientModulePath ?? route.modulePath;
    const importPath = toBrowserImportSpecifier(root, modulePath, base);
    const resolvedModuleFile = path.resolve(root, modulePath);

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

export function createClientProjectedFileSet(
  root: string,
  routes: DiscoveredRoute[],
  layouts: DiscoveredLayout[],
  resources: DiscoveredResource[],
  apiRoutes: DiscoveredApiRoute[],
): Set<string> {
  return new Set(
    [...routes, ...layouts, ...resources, ...apiRoutes]
      .filter((entry) => !entry.clientModulePath)
      .map((entry) => path.resolve(root, entry.modulePath)),
  );
}

export function normalizeViteModuleId(id: string): string {
  return path.resolve(id.replace(/[?#].*$/, ""));
}

export function createResourceManifestModule(manifest: DiscoveredResource[]): string {
  const serialized = JSON.stringify(manifest, null, 2);
  return `export const resourceManifest = ${serialized};`;
}

export function createServerManifestModule(
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
