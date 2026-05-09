import path from "node:path";

import { joinBasePath } from "../base-path";

export function normalizeRelativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

export function toImportSpecifier(root: string, relativeModulePath: string): string {
  const absolutePath = path.resolve(root, relativeModulePath);
  return `/@fs/${absolutePath.split(path.sep).join("/")}`;
}

export function toBrowserImportSpecifier(
  root: string,
  relativeModulePath: string,
  base: string,
): string {
  return joinBasePath(base, toImportSpecifier(root, relativeModulePath));
}

export function toProjectImportSpecifier(relativeModulePath: string): string {
  return `/${relativeModulePath}`;
}
