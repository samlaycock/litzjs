import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import ts from "typescript";

import type {
  DiscoveredApiRoute,
  DiscoveredLayout,
  DiscoveredResource,
  DiscoveredRoute,
} from "./types";

import { sortByPathSpecificity } from "../path-matching";
import { normalizeRelativePath } from "./paths";

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

  assertNoDuplicateManifestPaths("route", nextRouteManifest);
  assertNoDuplicateManifestPaths("layout", nextLayoutManifest);
  assertNoDuplicateManifestPaths("resource", nextResourceManifest);
  assertNoDuplicateManifestPaths("API route", nextApiManifest);

  return {
    routeManifest: sortByPathSpecificity(nextRouteManifest),
    layoutManifest: nextLayoutManifest,
    resourceManifest: nextResourceManifest,
    apiManifest: sortByPathSpecificity(nextApiManifest),
  };
}

export async function discoverAppManifests(
  root: string,
  appEntryPath: string,
): Promise<{
  routeManifest: DiscoveredRoute[];
  layoutManifest: DiscoveredLayout[];
  resourceManifest: DiscoveredResource[];
  apiManifest: DiscoveredApiRoute[];
}> {
  const appFile = path.resolve(root, appEntryPath);
  const source = await readFile(appFile, "utf8");
  const sourceFile = createModuleSourceFile(appFile, source);
  const registrations = discoverAppRegistrationImports(root, appFile, sourceFile);
  const [nextRouteManifest, nextResourceManifest, nextApiManifest] = await Promise.all([
    Promise.all(registrations.routes.map((file) => discoverRouteFromFile(root, file))),
    Promise.all(registrations.resources.map((file) => discoverResourceFromFile(root, file))),
    Promise.all(registrations.apiRoutes.map((file) => discoverApiRouteFromFile(root, file))),
  ]);
  const routeManifest = nextRouteManifest.filter(
    (entry): entry is DiscoveredRoute => entry !== null,
  );
  const resourceManifest = nextResourceManifest.filter(
    (entry): entry is DiscoveredResource => entry !== null,
  );
  const apiManifest = nextApiManifest.filter(
    (entry): entry is DiscoveredApiRoute => entry !== null,
  );

  assertNoDuplicateManifestPaths("route", routeManifest);
  assertNoDuplicateManifestPaths("resource", resourceManifest);
  assertNoDuplicateManifestPaths("API route", apiManifest);

  return {
    routeManifest: sortByPathSpecificity(routeManifest),
    layoutManifest: [],
    resourceManifest,
    apiManifest: sortByPathSpecificity(apiManifest),
  };
}

export async function discoverServerAppEntry(
  root: string,
  serverEntryPath: string,
): Promise<string | null> {
  const serverFile = path.resolve(root, serverEntryPath);
  const source = await readFile(serverFile, "utf8");
  const sourceFile = createModuleSourceFile(serverFile, source);
  const importedApps = getImportedLocalBindings(root, serverFile, sourceFile);

  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement)) {
      continue;
    }

    const createServerCall = findCreateServerCall(statement.expression);

    if (!createServerCall) {
      continue;
    }

    const options = createServerCall.arguments[0]
      ? unwrapManifestExpression(createServerCall.arguments[0])
      : null;

    if (!options || !ts.isObjectLiteralExpression(options)) {
      continue;
    }

    for (const property of options.properties) {
      if (!ts.isShorthandPropertyAssignment(property) || property.name.text !== "app") {
        continue;
      }

      const appEntry = importedApps.get(property.name.text);
      return appEntry ? normalizeRelativePath(root, appEntry) : null;
    }
  }

  return null;
}

export function isClientBoundaryModule(file: string): boolean {
  return /\.client\.(ts|tsx|js|jsx)$/.test(file);
}

export function isRouteLikeModuleFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(file);
}

export function assertNoDuplicateManifestPaths(
  kind: string,
  entries: readonly { readonly path: string; readonly modulePath: string }[],
): void {
  const entriesByPath = new Map<string, string[]>();

  for (const entry of entries) {
    const modulePaths = entriesByPath.get(entry.path);

    if (modulePaths) {
      modulePaths.push(entry.modulePath);
    } else {
      entriesByPath.set(entry.path, [entry.modulePath]);
    }
  }

  const duplicates = [...entriesByPath.entries()].filter(
    ([, modulePaths]) => modulePaths.length > 1,
  );

  if (duplicates.length === 0) {
    return;
  }

  const details = duplicates
    .map(([manifestPath, modulePaths]) => {
      const files = [...modulePaths]
        .sort((a, b) => a.localeCompare(b))
        .map((modulePath) => `    - ${modulePath}`)
        .join("\n");

      return `  ${manifestPath}\n${files}`;
    })
    .join("\n");

  throw new Error(`[litzjs] Duplicate ${kind} paths discovered:\n${details}`);
}

function resolveClientBoundaryModule(root: string, file: string): string | null {
  if (isClientBoundaryModule(file)) {
    return null;
  }

  const parsed = path.parse(file);
  const extensionCandidates = getClientBoundaryExtensionCandidates(parsed.ext);

  for (const extension of new Set(extensionCandidates)) {
    const candidate = path.join(parsed.dir, `${parsed.name}.client${extension}`);

    if (ts.sys.fileExists(candidate)) {
      return normalizeRelativePath(root, candidate);
    }
  }

  return null;
}

function getClientBoundaryExtensionCandidates(extension: string): readonly string[] {
  if (extension === ".ts" || extension === ".tsx") {
    return [extension, ".tsx"];
  }

  if (extension === ".js" || extension === ".jsx") {
    return [extension, ".jsx"];
  }

  return [extension];
}

async function discoverRoutes(root: string, patterns: string[]): Promise<DiscoveredRoute[]> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
  });

  const discovered = await Promise.all(
    files
      .filter((file) => !isClientBoundaryModule(file))
      .map(async (file) => discoverRouteFromFile(root, file)),
  );

  return discovered.filter((entry): entry is DiscoveredRoute => entry !== null);
}

async function discoverLayouts(root: string, patterns: string[]): Promise<DiscoveredLayout[]> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
  });

  const discovered = await Promise.all(
    files
      .filter((file) => !isClientBoundaryModule(file))
      .map(async (file) => discoverLayoutFromFile(root, file)),
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

function discoverAppRegistrationImports(
  root: string,
  appFile: string,
  sourceFile: ts.SourceFile,
): {
  readonly routes: string[];
  readonly resources: string[];
  readonly apiRoutes: string[];
} {
  const importedBindings = getImportedLocalBindings(root, appFile, sourceFile);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement.modifiers)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) {
        continue;
      }

      const appCall = findDefineAppCall(declaration.initializer);

      if (!appCall) {
        continue;
      }

      const options = appCall.arguments[0] ? unwrapManifestExpression(appCall.arguments[0]) : null;

      if (!options || !ts.isObjectLiteralExpression(options)) {
        continue;
      }

      return {
        routes: getRegisteredModuleFiles(options, "routes", importedBindings),
        resources: getRegisteredModuleFiles(options, "resources", importedBindings),
        apiRoutes: getRegisteredModuleFiles(options, "apiRoutes", importedBindings),
      };
    }
  }

  return { routes: [], resources: [], apiRoutes: [] };
}

function getRegisteredModuleFiles(
  options: ts.ObjectLiteralExpression,
  propertyName: string,
  importedBindings: ReadonlyMap<string, string>,
): string[] {
  for (const property of options.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      getObjectPropertyName(property.name) !== propertyName
    ) {
      continue;
    }

    const initializer = unwrapManifestExpression(property.initializer);

    if (!ts.isArrayLiteralExpression(initializer)) {
      return [];
    }

    return initializer.elements.flatMap((element) => {
      const unwrapped = unwrapManifestExpression(element);

      if (!ts.isIdentifier(unwrapped)) {
        return [];
      }

      const file = importedBindings.get(unwrapped.text);
      return file ? [file] : [];
    });
  }

  return [];
}

function getImportedLocalBindings(
  root: string,
  importerFile: string,
  sourceFile: ts.SourceFile,
): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith(".")
    ) {
      continue;
    }

    const moduleFile = resolveLocalModuleFile(
      path.dirname(importerFile),
      statement.moduleSpecifier.text,
    );

    if (!moduleFile) {
      continue;
    }

    const importClause = statement.importClause;

    if (importClause?.name) {
      bindings.set(importClause.name.text, moduleFile);
    }

    const namedBindings = importClause?.namedBindings;

    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      bindings.set(element.name.text, moduleFile);
    }
  }

  return bindings;
}

function resolveLocalModuleFile(directory: string, specifier: string): string | null {
  const base = path.resolve(directory, specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ];

  return candidates.find((candidate) => ts.sys.fileExists(candidate)) ?? null;
}

function findDefineAppCall(expression: ts.Expression | undefined): ts.CallExpression | null {
  const unwrapped = expression ? unwrapManifestExpression(expression) : null;

  if (!unwrapped || !ts.isCallExpression(unwrapped)) {
    return null;
  }

  if (ts.isIdentifier(unwrapped.expression) && unwrapped.expression.text === "defineApp") {
    return unwrapped;
  }

  return null;
}

function findCreateServerCall(expression: ts.Expression): ts.CallExpression | null {
  const unwrapped = unwrapManifestExpression(expression);

  if (ts.isCallExpression(unwrapped)) {
    if (ts.isIdentifier(unwrapped.expression) && unwrapped.expression.text === "createServer") {
      return unwrapped;
    }

    return findCreateServerCall(unwrapped.expression);
  }

  return null;
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
  factoryNames: ReadonlySet<string>,
  factoryNamespaceNames: ReadonlySet<string>,
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
    return resolveRouteLikeFactoryCall(
      binding,
      bindings,
      factoryName,
      factoryNames,
      factoryNamespaceNames,
      nextSeenBindings,
    );
  }

  if (
    ts.isCallExpression(unwrapped) &&
    isRouteLikeFactoryCallee(unwrapped.expression, factoryName, factoryNames, factoryNamespaceNames)
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
      factoryNames,
      factoryNamespaceNames,
      new Set(seenBindings),
    );

    return discoveredDefinition ?? undefined;
  });

  return discoveredDefinition;
}

function isRouteLikeFactoryCallee(
  expression: ts.Expression,
  factoryName: string,
  factoryNames: ReadonlySet<string>,
  factoryNamespaceNames: ReadonlySet<string>,
): boolean {
  if (ts.isIdentifier(expression)) {
    return factoryNames.has(expression.text);
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    factoryNamespaceNames.has(expression.expression.text) &&
    expression.name.text === factoryName
  ) {
    return true;
  }

  return false;
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
  const importedFactoryNames = getImportedLitzFactoryNames(sourceFile, factoryName);
  const importedFactoryNamespaceNames = getImportedLitzFactoryNamespaceNames(sourceFile);
  const factoryNames = new Set([factoryName, ...importedFactoryNames]);
  const importsFactory = importedFactoryNames.size > 0 || importedFactoryNamespaceNames.size > 0;

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
    if (importsFactory) {
      warnRouteLikeDiscoveryFailure(filePath, exportName, factoryName, "missing-export");
    }

    return null;
  }

  const definition = resolveRouteLikeFactoryCall(
    ts.factory.createIdentifier(exportedBinding),
    bindings,
    factoryName,
    factoryNames,
    importedFactoryNamespaceNames,
    new Set(),
  );

  if (!definition && importsFactory) {
    warnRouteLikeDiscoveryFailure(filePath, exportName, factoryName, "unsupported-definition");
  }

  return definition;
}

function getImportedLitzFactoryNamespaceNames(sourceFile: ts.SourceFile): Set<string> {
  const factoryNamespaceNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "litzjs"
    ) {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;

    if (!namedBindings || !ts.isNamespaceImport(namedBindings)) {
      continue;
    }

    factoryNamespaceNames.add(namedBindings.name.text);
  }

  return factoryNamespaceNames;
}

function getImportedLitzFactoryNames(sourceFile: ts.SourceFile, factoryName: string): Set<string> {
  const factoryNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "litzjs"
    ) {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;

    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === factoryName) {
        factoryNames.add(element.name.text);
      }
    }
  }

  return factoryNames;
}

function warnRouteLikeDiscoveryFailure(
  filePath: string,
  exportName: string,
  factoryName: string,
  reason: "missing-export" | "unsupported-definition",
): void {
  const expected = `export const ${exportName} = ${factoryName}("/path", ...)`;
  const detail =
    reason === "missing-export"
      ? `does not export the expected "${exportName}" binding`
      : `exports "${exportName}", but the path could not be read from a static ${factoryName} call`;

  console.warn(
    `[litzjs] ${filePath} imports ${factoryName} from "litzjs" but ${detail}. ` +
      `Discovery requires ${expected}, or an exported alias that resolves to that static call.`,
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
    clientModulePath: resolveClientBoundaryModule(root, file),
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
    clientModulePath: resolveClientBoundaryModule(root, file),
  };
}

async function discoverResources(root: string, patterns: string[]): Promise<DiscoveredResource[]> {
  const files = await glob(patterns, {
    cwd: root,
    absolute: true,
  });

  const discovered = await Promise.all(
    files
      .filter((file) => !isClientBoundaryModule(file))
      .map(async (file) => discoverResourceFromFile(root, file)),
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
    clientModulePath: resolveClientBoundaryModule(root, file),
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
    files
      .filter((file) => !isClientBoundaryModule(file))
      .map(async (file) => discoverApiRouteFromFile(root, file)),
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
    clientModulePath: resolveClientBoundaryModule(root, file),
  };
}
