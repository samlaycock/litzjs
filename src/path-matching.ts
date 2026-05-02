type CompiledPattern = {
  pattern: URLPattern;
  groupNames: string[];
  isDynamic: boolean;
};

const patternCache = new Map<string, CompiledPattern | null>();

function compilePattern(pattern: string): CompiledPattern | null {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) return cached;

  try {
    const pathname = pattern;
    const urlPattern = new URLPattern({ pathname });
    const groupNames = extractGroupNames(urlPattern);
    const hasUnnamedWildcard = pathname.includes(":*");
    const isDynamic = groupNames.length > 0 || hasUnnamedWildcard;

    const result: CompiledPattern = {
      pattern: urlPattern,
      groupNames,
      isDynamic,
    };

    patternCache.set(pattern, result);
    return result;
  } catch {
    patternCache.set(pattern, null);
    return null;
  }
}

function extractGroupNames(urlPattern: URLPattern): string[] {
  const names: string[] = [];
  const pathname = urlPattern.pathname ?? "";

  // Parse pattern string for group names
  const groupRegex = /:(\w+)(?:[?*+]|\([^)]*\))?/g;
  let match;
  while ((match = groupRegex.exec(pathname)) !== null) {
    if (match[1] && !names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  return names;
}

export function trimPathSegments(value: string): string[] {
  if (value === "/") {
    return [];
  }

  return value
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

export function hasPatternSegments(path: string): boolean {
  const compiled = compilePattern(path);
  if (!compiled) return false;
  return compiled.isDynamic;
}

export function hasMalformedPathnameEncoding(pathname: string): boolean {
  const segments = trimPathSegments(pathname);
  return segments.some((segment) => {
    try {
      decodeURIComponent(segment);
      return false;
    } catch {
      return true;
    }
  });
}

export function matchPathname(routePath: string, pathname: string): Record<string, string> | null {
  const compiled = compilePattern(routePath);
  if (!compiled) return null;

  try {
    const result = compiled.pattern.exec({ pathname });

    if (!result?.pathname) return null;

    const params: Record<string, string> = {};
    for (const name of compiled.groupNames) {
      const value = result.pathname.groups[name];
      if (value !== undefined && value !== null) {
        params[name] = value;
      }
    }

    return params;
  } catch {
    return null;
  }
}

export function matchPrefixPathname(
  routePath: string,
  pathname: string,
): Record<string, string> | null {
  const compiled = compilePattern(routePath);
  if (!compiled) return null;

  const prefixPattern = routePath.endsWith("*") ? routePath : `${routePath}/*`;

  const prefixCompiled = compilePattern(prefixPattern);
  if (!prefixCompiled) return null;

  try {
    const result = prefixCompiled.pattern.exec({ pathname });

    if (!result?.pathname) return null;

    const params: Record<string, string> = {};
    for (const name of compiled.groupNames) {
      const value = result.pathname.groups[name];
      if (value !== undefined) {
        params[name] = value;
      }
    }

    return params;
  } catch {
    return null;
  }
}

export function interpolatePath(
  pathPattern: string,
  params: Record<string, string>,
  paramLabel = "path",
): string {
  const compiled = compilePattern(pathPattern);
  if (!compiled) {
    return pathPattern;
  }

  let result = pathPattern;

  for (const name of compiled.groupNames) {
    const value = params[name];
    if (value === undefined) {
      const optionalRegex = new RegExp(`:${name}\\?`);
      if (optionalRegex.test(result)) {
        result = result.replace(optionalRegex, "");
        continue;
      }

      const repeatRegex = new RegExp(`:${name}[*+]`);
      if (repeatRegex.test(result)) {
        result = result.replace(repeatRegex, "");
        continue;
      }

      throw new Error(`Missing required ${paramLabel} param "${name}" for path "${pathPattern}".`);
    }

    const repeatRegex = new RegExp(`:${name}[*+]`);
    if (repeatRegex.test(result)) {
      // For repeat groups, encode each segment but preserve slashes
      const segments = value.split("/");
      const encodedSegments = segments.map((seg) => encodeURIComponent(seg));
      result = result.replace(repeatRegex, encodedSegments.join("/"));
      continue;
    }

    const optionalRegex = new RegExp(`:${name}\\?`);
    if (optionalRegex.test(result)) {
      result = result.replace(optionalRegex, encodeURIComponent(value));
      continue;
    }

    const regexGroupRegex = new RegExp(`:${name}\\([^)]*\\)`);
    if (regexGroupRegex.test(result)) {
      result = result.replace(regexGroupRegex, encodeURIComponent(value));
      continue;
    }

    const simpleRegex = new RegExp(`:${name}(?=[/?#]|$)`);
    result = result.replace(simpleRegex, encodeURIComponent(value));
  }

  result = result.replace(/\{([^}]*)\}\?/g, (_, inner) => {
    return inner || "";
  });

  result = result.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";

  return result;
}

export function extractRouteLikeParams(
  pathPattern: string,
  pathname: string,
): Record<string, string> | null {
  const prefixMatch = matchPrefixPathname(pathPattern, pathname);
  if (prefixMatch) {
    return prefixMatch;
  }

  return matchPathname(pathPattern, pathname);
}

function getPatternSpecificity(pattern: string): number {
  const segments = trimPathSegments(pattern);
  let score = 0;

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      if (segment.includes("(")) {
        score += 3;
      } else if (segment.endsWith("*") || segment.endsWith("+")) {
        score += 0;
      } else if (segment.endsWith("?")) {
        score += 1;
      } else {
        score += 2;
      }
    } else if (segment.includes("*") && !segment.startsWith(":")) {
      score += 0;
    } else {
      score += 10;
      score += segment.length;
    }
  }

  return score;
}

export function comparePathSpecificity(left: string, right: string): number {
  const leftHasWildcard = left.endsWith("/*") || /:\w*\*$/.test(left);
  const rightHasWildcard = right.endsWith("/*") || /:\w*\*$/.test(right);

  if (leftHasWildcard !== rightHasWildcard) {
    return leftHasWildcard ? 1 : -1;
  }

  const leftSegments = trimPathSegments(left);
  const rightSegments = trimPathSegments(right);

  if (leftSegments.length !== rightSegments.length) {
    return rightSegments.length - leftSegments.length;
  }

  const leftScore = getPatternSpecificity(left);
  const rightScore = getPatternSpecificity(right);

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return left.localeCompare(right);
}

export function sortByPathSpecificity<TEntry extends { path: string }>(
  entries: readonly TEntry[],
): TEntry[] {
  return [...entries].sort((left, right) => comparePathSpecificity(left.path, right.path));
}
