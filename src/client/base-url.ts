import { joinBasePath, resolveBasePathname, stripBasePath } from "../base-path";

let configuredBaseUrl: string | undefined;
const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function configureClientBaseUrl(baseUrl: string | undefined): void {
  configuredBaseUrl = baseUrl;
}

export function resolveClientTransportPath(pathname: string): string {
  return joinBasePath(resolveConfiguredBaseUrl(), pathname);
}

export function resolveClientRoutePathname(pathname: string): string {
  return resolveBasePathname(pathname, resolveConfiguredBaseUrl());
}

export function resolveClientHref(href: string): string {
  if (
    ABSOLUTE_URL_PATTERN.test(href) ||
    href.startsWith("//") ||
    href.startsWith("#") ||
    href.startsWith("?")
  ) {
    return href;
  }

  const baseUrl = resolveConfiguredBaseUrl();
  const pathnameEnd = href.search(/[?#]/);
  const pathname = pathnameEnd === -1 ? href : href.slice(0, pathnameEnd);
  const suffix = pathnameEnd === -1 ? "" : href.slice(pathnameEnd);

  if (stripBasePath(pathname || "/", baseUrl) !== null) {
    return href;
  }

  return `${joinBasePath(baseUrl, pathname)}${suffix}`;
}

export function resolveConfiguredBaseUrl(): string | undefined {
  return configuredBaseUrl;
}
