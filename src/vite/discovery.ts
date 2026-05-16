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

  return {
    routeManifest: sortByPathSpecificity(nextRouteManifest),
    layoutManifest: nextLayoutManifest,
    resourceManifest: nextResourceManifest,
    apiManifest: sortByPathSpecificity(nextApiManifest),
  };
}

export function isClientBoundaryModule(file: string): boolean {
  return /\.client\.(ts|tsx|js|jsx)$/.test(file);
}

export function isRouteLikeModuleFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(file);
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
  factoryNames: ReadonlySet<string>,
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
    return resolveRouteLikeFactoryCall(binding, bindings, factoryNames, nextSeenBindings);
  }

  if (
    ts.isCallExpression(unwrapped) &&
    ts.isIdentifier(unwrapped.expression) &&
    factoryNames.has(unwrapped.expression.text)
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
      factoryNames,
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
  const importedFactoryNames = getImportedLitzFactoryNames(sourceFile, factoryName);
  const factoryNames = new Set([factoryName, ...importedFactoryNames]);
  const importsFactory = importedFactoryNames.size > 0;

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
    factoryNames,
    new Set(),
  );

  if (!definition && importsFactory) {
    warnRouteLikeDiscoveryFailure(filePath, exportName, factoryName, "unsupported-definition");
  }

  return definition;
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
