import { joinBasePath } from "../base-path";

let configuredBaseUrl: string | undefined;

export function configureClientBaseUrl(baseUrl: string | undefined): void {
  configuredBaseUrl = baseUrl;
}

export function resolveClientTransportPath(pathname: string): string {
  return joinBasePath(resolveConfiguredBaseUrl(), pathname);
}

function resolveConfiguredBaseUrl(): string | undefined {
  return configuredBaseUrl;
}
