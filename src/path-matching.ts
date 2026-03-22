export function trimPathSegments(value: string): string[] {
  if (value === "/") {
    return [];
  }

  return value
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

export function matchPathname(routePath: string, pathname: string): Record<string, string> | null {
  const routeSegments = trimPathSegments(routePath);
  const pathSegments = trimPathSegments(pathname);

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
  return matchPrefixPathname(pathPattern, pathname) ?? matchPathname(pathPattern, pathname);
}

export function comparePathSpecificity(left: string, right: string): number {
  const leftSegments = trimPathSegments(left);
  const rightSegments = trimPathSegments(right);

  if (leftSegments.length !== rightSegments.length) {
    return rightSegments.length - leftSegments.length;
  }

  for (let index = 0; index < leftSegments.length; index += 1) {
    const leftSegment = leftSegments[index] ?? "";
    const rightSegment = rightSegments[index] ?? "";
    const leftRank = leftSegment.startsWith(":") ? 0 : 1;
    const rightRank = rightSegment.startsWith(":") ? 0 : 1;

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
