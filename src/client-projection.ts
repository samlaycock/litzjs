import ts from "typescript";

export function createClientModuleProjection(filePath: string, source: string): string | null {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const topLevelDeclarations = collectTopLevelDeclarations(sourceFile);
  const importStatements = sourceFile.statements.filter(ts.isImportDeclaration);
  const topLevelNames = new Set(topLevelDeclarations.keys());
  const importBindings = collectImportBindings(importStatements);
  const rootStatement = findProjectionRootStatement(sourceFile);

  if (!rootStatement) {
    return null;
  }

  const requiredStatements = new Set<ts.Statement>([rootStatement]);
  const referencedImports = new Set<string>();
  const queue: ts.Statement[] = [rootStatement];

  while (queue.length > 0) {
    const statement = queue.pop();

    if (!statement) {
      continue;
    }

    const referencedNames = collectReferencedNames(
      statement,
      topLevelNames,
      importBindings,
      shouldSkipProjectionSubtree,
    );

    for (const importName of referencedNames.imports) {
      referencedImports.add(importName);
    }

    for (const declarationName of referencedNames.locals) {
      const declarationStatement = topLevelDeclarations.get(declarationName);

      if (!declarationStatement || requiredStatements.has(declarationStatement)) {
        continue;
      }

      requiredStatements.add(declarationStatement);
      queue.push(declarationStatement);
    }
  }

  const printedImports = importStatements
    .map((statement) => projectImportStatement(statement, referencedImports))
    .filter((statement): statement is ts.ImportDeclaration => statement !== null);
  const projectionStatements = sourceFile.statements.filter((statement) =>
    requiredStatements.has(statement),
  );
  const needsPlaceholder = projectionStatements.some((statement) =>
    projectionNeedsPlaceholder(statement),
  );
  const transformedStatements = projectionStatements.map((statement) =>
    transformProjectionStatement(statement),
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const placeholder = needsPlaceholder
    ? [
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createIdentifier("__litz_server_placeholder__"),
                undefined,
                undefined,
                ts.factory.createObjectLiteralExpression(),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      ]
    : [];
  const moduleSource = [...printedImports, ...placeholder, ...transformedStatements]
    .map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile))
    .join("\n\n");

  return `${moduleSource}\n`;
}

function findProjectionRootStatement(sourceFile: ts.SourceFile): ts.Statement | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    const declaration = statement.declarationList.declarations[0];

    if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer) {
      continue;
    }

    const exportName = declaration.name.text;

    if (
      exportName !== "route" &&
      exportName !== "layout" &&
      exportName !== "resource" &&
      exportName !== "api"
    ) {
      continue;
    }

    return statement;
  }

  return null;
}

function collectTopLevelDeclarations(sourceFile: ts.SourceFile): Map<string, ts.Statement> {
  const declarations = new Map<string, ts.Statement>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declarations.set(declaration.name.text, statement);
        }
      }
    }
  }

  return declarations;
}

function collectImportBindings(imports: readonly ts.ImportDeclaration[]): Set<string> {
  const bindings = new Set<string>();

  for (const statement of imports) {
    if (!statement.importClause) {
      continue;
    }

    if (statement.importClause.isTypeOnly) {
      continue;
    }

    if (statement.importClause.name) {
      bindings.add(statement.importClause.name.text);
    }

    const namedBindings = statement.importClause.namedBindings;

    if (!namedBindings) {
      continue;
    }

    if (ts.isNamespaceImport(namedBindings)) {
      bindings.add(namedBindings.name.text);
      continue;
    }

    for (const element of namedBindings.elements) {
      if (element.isTypeOnly) {
        continue;
      }

      bindings.add(element.name.text);
    }
  }

  return bindings;
}

function collectReferencedNames(
  statement: ts.Statement,
  topLevelNames: Set<string>,
  importBindings: Set<string>,
  shouldSkipSubtree: (node: ts.Node) => boolean,
): { locals: Set<string>; imports: Set<string> } {
  const locals = new Set<string>();
  const imports = new Set<string>();

  function visit(node: ts.Node, scopes: readonly ReadonlySet<string>[]): void {
    if (shouldSkipSubtree(node)) {
      return;
    }

    if (ts.isTypeNode(node)) {
      return;
    }

    const nextScopes = getProjectionScopes(node, scopes);

    if (ts.isIdentifier(node)) {
      if (isIgnoredIdentifierReference(node)) {
        return;
      }

      if (isShadowedProjectionReference(node.text, nextScopes)) {
        return;
      }

      if (importBindings.has(node.text)) {
        imports.add(node.text);
        return;
      }

      if (topLevelNames.has(node.text)) {
        locals.add(node.text);
      }

      return;
    }

    ts.forEachChild(node, (child) => visit(child, nextScopes));
  }

  visit(statement, []);
  return { locals, imports };
}

function getProjectionScopes(
  node: ts.Node,
  scopes: readonly ReadonlySet<string>[],
): readonly ReadonlySet<string>[] {
  const bindings = collectProjectionScopeBindings(node);

  if (!bindings || bindings.size === 0) {
    return scopes;
  }

  return [...scopes, bindings];
}

function collectProjectionScopeBindings(node: ts.Node): ReadonlySet<string> | null {
  if (isProjectionFunctionLike(node)) {
    const bindings = new Set<string>();

    for (const parameter of node.parameters) {
      collectBindingNames(parameter.name, bindings);
    }

    if (node.body) {
      collectFunctionScopedVarBindings(node.body, bindings);
    }

    return bindings;
  }

  if (ts.isBlock(node)) {
    return collectBlockScopeBindings(node.statements);
  }

  if (ts.isCaseBlock(node)) {
    const statements = node.clauses.flatMap((clause) => clause.statements);

    return collectBlockScopeBindings(statements);
  }

  if (ts.isCatchClause(node)) {
    const bindings = new Set<string>();

    if (node.variableDeclaration) {
      collectBindingNames(node.variableDeclaration.name, bindings);
    }

    return bindings;
  }

  if (
    (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
    node.initializer &&
    ts.isVariableDeclarationList(node.initializer) &&
    isBlockScopedDeclarationList(node.initializer)
  ) {
    const bindings = new Set<string>();

    collectVariableDeclarationListBindings(node.initializer, bindings);
    return bindings;
  }

  return null;
}

function collectFunctionScopedVarBindings(node: ts.Node, bindings: Set<string>): void {
  function visit(current: ts.Node): void {
    if (current !== node && isProjectionFunctionLike(current)) {
      return;
    }

    if (ts.isVariableDeclarationList(current) && !isBlockScopedDeclarationList(current)) {
      collectVariableDeclarationListBindings(current, bindings);
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
}

function collectBlockScopeBindings(statements: readonly ts.Statement[]): ReadonlySet<string> {
  const bindings = new Set<string>();

  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      bindings.add(statement.name.text);
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      bindings.add(statement.name.text);
      continue;
    }

    if (
      ts.isVariableStatement(statement) &&
      isBlockScopedDeclarationList(statement.declarationList)
    ) {
      collectVariableDeclarationListBindings(statement.declarationList, bindings);
    }
  }

  return bindings;
}

function collectVariableDeclarationListBindings(
  declarationList: ts.VariableDeclarationList,
  bindings: Set<string>,
): void {
  for (const declaration of declarationList.declarations) {
    collectBindingNames(declaration.name, bindings);
  }
}

function collectBindingNames(name: ts.BindingName, bindings: Set<string>): void {
  if (ts.isIdentifier(name)) {
    bindings.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (!ts.isBindingElement(element)) {
      continue;
    }

    collectBindingNames(element.name, bindings);
  }
}

function isProjectionFunctionLike(
  node: ts.Node,
): node is
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isBlockScopedDeclarationList(declarationList: ts.VariableDeclarationList): boolean {
  return (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
}

function isShadowedProjectionReference(
  name: string,
  scopes: readonly ReadonlySet<string>[],
): boolean {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    if (scopes[index]?.has(name)) {
      return true;
    }
  }

  return false;
}

function isIgnoredIdentifierReference(node: ts.Identifier): boolean {
  const parent = node.parent;

  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return true;
  }

  if (ts.isPropertyAssignment(parent) && parent.name === node) {
    return true;
  }

  if (ts.isShorthandPropertyAssignment(parent)) {
    return false;
  }

  if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) {
    return true;
  }

  if (
    ts.isVariableDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isFunctionExpression(parent) ||
    ts.isParameter(parent) ||
    ts.isBindingElement(parent) ||
    ts.isClassDeclaration(parent)
  ) {
    return parent.name === node;
  }

  return false;
}

function shouldSkipProjectionSubtree(node: ts.Node): boolean {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "server"
  ) {
    return true;
  }

  if (
    (ts.isPropertyAssignment(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isShorthandPropertyAssignment(node)) &&
    isServerOnlyProjectionProperty(node)
  ) {
    return true;
  }

  return false;
}

function projectImportStatement(
  statement: ts.ImportDeclaration,
  referencedImports: Set<string>,
): ts.ImportDeclaration | null {
  if (!statement.importClause) {
    return statement;
  }

  const defaultImport =
    statement.importClause.name && referencedImports.has(statement.importClause.name.text)
      ? statement.importClause.name
      : undefined;
  const namedBindings = statement.importClause.namedBindings;
  let nextNamedBindings: ts.NamedImportBindings | undefined;

  if (namedBindings) {
    if (ts.isNamespaceImport(namedBindings)) {
      if (referencedImports.has(namedBindings.name.text)) {
        nextNamedBindings = namedBindings;
      }
    } else {
      const elements = namedBindings.elements.filter((element) =>
        referencedImports.has(element.name.text),
      );

      if (elements.length > 0) {
        nextNamedBindings = ts.factory.updateNamedImports(namedBindings, elements);
      }
    }
  }

  if (!defaultImport && !nextNamedBindings) {
    return null;
  }

  return ts.factory.updateImportDeclaration(
    statement,
    statement.modifiers,
    ts.factory.updateImportClause(
      statement.importClause,
      statement.importClause.isTypeOnly,
      defaultImport,
      nextNamedBindings,
    ),
    statement.moduleSpecifier,
    statement.attributes,
  );
}

function projectionNeedsPlaceholder(statement: ts.Statement): boolean {
  let required = false;

  function visit(node: ts.Node): void {
    if (required) {
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "server" || node.expression.text === "defineApiRoute")
    ) {
      required = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(statement);
  return required;
}

function transformProjectionStatement(statement: ts.Statement): ts.Statement {
  const result = ts.transform(statement, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          if (node.expression.text === "server") {
            return ts.factory.createIdentifier("__litz_server_placeholder__");
          }

          if (
            (node.expression.text === "defineRoute" ||
              node.expression.text === "defineLayout" ||
              node.expression.text === "defineResource") &&
            node.arguments[1] &&
            ts.isObjectLiteralExpression(node.arguments[1])
          ) {
            const pathArgument = node.arguments[0] ?? ts.factory.createStringLiteral("");
            const properties = node.arguments[1].properties.map((property) => {
              if (ts.isShorthandPropertyAssignment(property)) {
                const name = property.name.text;

                if (name === "loader" || name === "action") {
                  return ts.factory.createPropertyAssignment(
                    property.name,
                    ts.factory.createIdentifier("__litz_server_placeholder__"),
                  );
                }

                if (name === "middleware") {
                  return ts.factory.createPropertyAssignment(
                    property.name,
                    ts.factory.createArrayLiteralExpression(),
                  );
                }

                return property;
              }

              if (!ts.isPropertyAssignment(property)) {
                return property;
              }

              const name = getObjectPropertyName(property.name);

              if (name === "loader" || name === "action") {
                return ts.factory.updatePropertyAssignment(
                  property,
                  property.name,
                  ts.factory.createIdentifier("__litz_server_placeholder__"),
                );
              }

              if (name === "middleware") {
                return ts.factory.updatePropertyAssignment(
                  property,
                  property.name,
                  ts.factory.createArrayLiteralExpression(),
                );
              }

              return ts.visitEachChild(property, visit, context);
            });

            return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              pathArgument,
              ts.factory.updateObjectLiteralExpression(node.arguments[1], properties),
            ]);
          }

          if (
            node.expression.text === "defineApiRoute" &&
            node.arguments[1] &&
            ts.isObjectLiteralExpression(node.arguments[1])
          ) {
            const pathArgument = node.arguments[0] ?? ts.factory.createStringLiteral("");
            const properties = node.arguments[1].properties.map((property) => {
              if (ts.isPropertyAssignment(property)) {
                return ts.factory.updatePropertyAssignment(
                  property,
                  property.name,
                  ts.factory.createIdentifier("__litz_server_placeholder__"),
                );
              }

              if (ts.isMethodDeclaration(property)) {
                return ts.factory.createPropertyAssignment(
                  property.name,
                  ts.factory.createIdentifier("__litz_server_placeholder__"),
                );
              }

              if (ts.isShorthandPropertyAssignment(property)) {
                return ts.factory.createPropertyAssignment(
                  property.name,
                  ts.factory.createIdentifier("__litz_server_placeholder__"),
                );
              }

              return property;
            });

            return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              pathArgument,
              ts.factory.updateObjectLiteralExpression(node.arguments[1], properties),
            ]);
          }
        }

        return ts.visitEachChild(node, visit, context);
      };

      return (node: ts.Statement) => ts.visitNode(node, visit) as ts.Statement;
    },
  ]);
  const [transformed] = result.transformed;
  result.dispose();
  return transformed ?? statement;
}

function getObjectPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function isServerOnlyProjectionProperty(
  node: ts.PropertyAssignment | ts.MethodDeclaration | ts.ShorthandPropertyAssignment,
): boolean {
  const parent = node.parent;

  if (!ts.isObjectLiteralExpression(parent)) {
    return false;
  }

  const call = parent.parent;

  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) {
    return false;
  }

  const propertyName = ts.isShorthandPropertyAssignment(node)
    ? node.name.text
    : getObjectPropertyName(node.name);

  if (!propertyName) {
    return false;
  }

  if (
    call.expression.text === "defineRoute" ||
    call.expression.text === "defineLayout" ||
    call.expression.text === "defineResource"
  ) {
    return propertyName === "loader" || propertyName === "action" || propertyName === "middleware";
  }

  if (call.expression.text === "defineApiRoute") {
    return true;
  }

  return false;
}
