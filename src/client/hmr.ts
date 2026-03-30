export interface ViteHotContextLike {
  on(event: string, listener: (data?: unknown) => void): void;
  off?(event: string, listener: (data?: unknown) => void): void;
}

export interface ClientDefinitionHotUpdate {
  kind: "route" | "layout" | "resource" | "api";
  definition: unknown;
}

export interface ViteBeforeUpdatePayloadLike {
  updates?: Array<{
    path?: string;
    acceptedPath?: string;
  }>;
}

declare global {
  var __litzjsViteHot: ViteHotContextLike | undefined;
  var __litzjsHandleClientDefinitionHotUpdate:
    | ((update: ClientDefinitionHotUpdate) => void)
    | undefined;
}

export function getLitzHotContext(): ViteHotContextLike | undefined {
  return globalThis.__litzjsViteHot;
}

export function dispatchClientDefinitionHotUpdate(update: ClientDefinitionHotUpdate): void {
  globalThis.__litzjsHandleClientDefinitionHotUpdate?.(update);
}

export function getChangedFileFromRscUpdate(data?: unknown): string | null {
  if (typeof data !== "object" || data === null || !("file" in data)) {
    return null;
  }

  return typeof data.file === "string" ? data.file : null;
}

function normalizeBrowserModulePath(path: string): string {
  return path.replace(/[?#].*$/, "");
}

function toAbsoluteFilePathFromBrowserModulePath(
  path: string,
  projectRoot: string | null,
): string | null {
  if (
    !projectRoot ||
    !path.startsWith("/") ||
    path.startsWith("/@") ||
    path.startsWith("/node_modules/")
  ) {
    return null;
  }

  return `${projectRoot.replace(/\/$/, "")}${path}`;
}

export function getBrowserHotUpdatedFiles(
  data: unknown,
  projectRoot: string | null,
): ReadonlySet<string> {
  const updatedFiles = new Set<string>();

  if (typeof data !== "object" || data === null || !("updates" in data)) {
    return updatedFiles;
  }

  if (!Array.isArray(data.updates)) {
    return updatedFiles;
  }

  for (const update of data.updates) {
    if (typeof update !== "object" || update === null) {
      continue;
    }

    const normalizedPaths = [update.path, update.acceptedPath]
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeBrowserModulePath(value));

    for (const normalizedPath of normalizedPaths) {
      const absoluteFilePath = toAbsoluteFilePathFromBrowserModulePath(normalizedPath, projectRoot);

      if (absoluteFilePath) {
        updatedFiles.add(absoluteFilePath);
      }
    }
  }

  return updatedFiles;
}

export function shouldRefreshRouteModuleFromRscUpdate(
  data: unknown,
  routeModuleFiles: ReadonlySet<string>,
  browserHotUpdatedFiles?: ReadonlySet<string>,
): boolean {
  const changedFile = getChangedFileFromRscUpdate(data);

  if (!changedFile) {
    return true;
  }

  if (routeModuleFiles.has(changedFile)) {
    return false;
  }

  return !browserHotUpdatedFiles?.has(changedFile);
}

export function subscribeToRscHotUpdates(
  hot: ViteHotContextLike | undefined,
  onUpdate: (data?: unknown) => void,
): (() => void) | undefined {
  if (!hot) {
    return undefined;
  }

  const handleUpdate = (data?: unknown) => {
    onUpdate(data);
  };

  hot.on("rsc:update", handleUpdate);

  return () => {
    hot.off?.("rsc:update", handleUpdate);
  };
}
