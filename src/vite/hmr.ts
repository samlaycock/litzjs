import type { ViteDevServer } from "vite";

import { normalizeRelativePath, toImportSpecifier } from "./paths";
import { normalizeViteModuleId } from "./virtual-modules";

export function invalidateVirtualModule(server: ViteDevServer, id: string): void {
  const module = server.moduleGraph.getModuleById(id);

  if (module) {
    server.moduleGraph.invalidateModule(module);
  }
}

export function collectClientHotUpdateModules<TModule extends { id: string | null }>(
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
