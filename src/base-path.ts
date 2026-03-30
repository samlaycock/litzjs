const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function normalizeBasePath(base: string | undefined): string {
  if (!base) {
    return "/";
  }

  let pathname = base.trim();

  if (!pathname) {
    return "/";
  }

  if (ABSOLUTE_URL_PATTERN.test(pathname) || pathname.startsWith("//")) {
    pathname = new URL(pathname, "https://litzjs.local").pathname;
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replace(/\/+$/, "");

  return pathname || "/";
}

export function joinBasePath(base: string | undefined, pathname: string): string {
  const normalizedBase = normalizeBasePath(base);
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return normalizedBase === "/" ? normalizedPathname : `${normalizedBase}${normalizedPathname}`;
}

export function stripBasePath(pathname: string, base: string | undefined): string | null {
  const normalizedBase = normalizeBasePath(base);

  if (normalizedBase === "/") {
    return pathname;
  }

  if (pathname === normalizedBase || pathname === `${normalizedBase}/`) {
    return "/";
  }

  if (pathname.startsWith(`${normalizedBase}/`)) {
    return pathname.slice(normalizedBase.length) || "/";
  }

  return null;
}

export function resolveBasePathname(pathname: string, base: string | undefined): string {
  // Preserve the original pathname when it does not include the configured
  // base so deployments behind a proxy that strips the mount prefix before
  // forwarding still route internal Litz requests correctly.
  return stripBasePath(pathname, base) ?? pathname;
}
