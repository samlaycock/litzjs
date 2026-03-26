export function trimPathSegments(value: string): string[] {
  if (value === "/") {
    return [];
  }

  return value
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

function isWildcardSegment(segment: string): boolean {
  return segment.startsWith("*");
}

export function hasPatternSegments(path: string): boolean {
  return trimPathSegments(path).some(
    (segment) => segment.startsWith(":") || isWildcardSegment(segment),
  );
}

function getWildcardParamName(segment: string): string | null {
  if (segment === "*") {
    return null;
  }

  if (segment.startsWith("*")) {
    return segment.slice(1);
  }

  return null;
}

export function matchPathname(routePath: string, pathname: string): Record<string, string> | null {
  const routeSegments = trimPathSegments(routePath);
  const pathSegments = trimPathSegments(pathname);
  const lastRouteSegment = routeSegments[routeSegments.length - 1];

  if (lastRouteSegment && isWildcardSegment(lastRouteSegment)) {
    const staticSegments = routeSegments.slice(0, -1);

    if (pathSegments.length < staticSegments.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let index = 0; index < staticSegments.length; index += 1) {
      const routeSegment = staticSegments[index];
      const pathSegment = pathSegments[index];

      if (!routeSegment || pathSegment === undefined) {
        return null;
      }

      if (routeSegment.startsWith(":")) {
        params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
        continue;
      }

      if (routeSegment !== pathSegment) {
        return null;
      }
    }

    const remaining = pathSegments.slice(staticSegments.length).map(decodeURIComponent).join("/");
    const paramName = getWildcardParamName(lastRouteSegment);

    if (paramName) {
      params[paramName] = remaining;
    }

    return params;
  }

  if (routeSegments.length !== pathSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const pathSegment = pathSegments[index];

    if (!routeSegment || pathSegment === undefined) {
      return null;
    }

    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
      continue;
    }

    if (routeSegment !== pathSegment) {
      return null;
    }
  }

  return params;
}

export function matchPrefixPathname(
  routePath: string,
  pathname: string,
): Record<string, string> | null {
  const routeSegments = trimPathSegments(routePath);
  const pathSegments = trimPathSegments(pathname);
  const lastRouteSegment = routeSegments[routeSegments.length - 1];

  if (lastRouteSegment && isWildcardSegment(lastRouteSegment)) {
    return matchPathname(routePath, pathname);
  }

  if (routeSegments.length > pathSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const pathSegment = pathSegments[index];

    if (!routeSegment || pathSegment === undefined) {
      return null;
    }

    if (routeSegment.startsWith(":")) {
      params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
      continue;
    }

    if (routeSegment !== pathSegment) {
      return null;
    }
  }

  return params;
}

export function extractRouteLikeParams(
  pathPattern: string,
  pathname: string,
): Record<string, string> | null {
  const prefixMatch = matchPrefixPathname(pathPattern, pathname);

  if (prefixMatch) {
    return prefixMatch;
  }

  const routeSegments = trimPathSegments(pathPattern);
  const lastSegment = routeSegments[routeSegments.length - 1];

  if (lastSegment && isWildcardSegment(lastSegment)) {
    return null;
  }

  return matchPathname(pathPattern, pathname);
}

function segmentRank(segment: string): number {
  if (isWildcardSegment(segment)) {
    return -1;
  }

  if (segment.startsWith(":")) {
    return 0;
  }

  return 1;
}

export function comparePathSpecificity(left: string, right: string): number {
  const leftSegments = trimPathSegments(left);
  const rightSegments = trimPathSegments(right);
  const leftHasWildcard =
    leftSegments.length > 0 && isWildcardSegment(leftSegments[leftSegments.length - 1] ?? "");
  const rightHasWildcard =
    rightSegments.length > 0 && isWildcardSegment(rightSegments[rightSegments.length - 1] ?? "");

  if (leftHasWildcard !== rightHasWildcard) {
    return leftHasWildcard ? 1 : -1;
  }

  if (leftSegments.length !== rightSegments.length) {
    return rightSegments.length - leftSegments.length;
  }

  for (let index = 0; index < leftSegments.length; index += 1) {
    const leftSegment = leftSegments[index] ?? "";
    const rightSegment = rightSegments[index] ?? "";
    const leftRank = segmentRank(leftSegment);
    const rightRank = segmentRank(rightSegment);

    if (leftRank !== rightRank) {
      return rightRank - leftRank;
    }

    if (leftRank === 1 && leftSegment.length !== rightSegment.length) {
      return rightSegment.length - leftSegment.length;
    }
  }

  return left.localeCompare(right);
}

export function sortByPathSpecificity<TEntry extends { path: string }>(
  entries: readonly TEntry[],
): TEntry[] {
  return [...entries].sort((left, right) => comparePathSpecificity(left.path, right.path));
}
