import { joinBasePath } from "../base-path";

declare global {
  var __litzjsBaseUrl: string | undefined;
}

export function resolveClientTransportPath(pathname: string): string {
  return joinBasePath(resolveConfiguredBaseUrl(), pathname);
}

function resolveConfiguredBaseUrl(): string | undefined {
  return globalThis.__litzjsBaseUrl;
}
