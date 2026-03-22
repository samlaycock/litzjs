import type { SearchParamsUpdate } from "../index";

export function isHashOnlyNavigation(currentUrl: URL, nextUrl: URL): boolean {
  return (
    currentUrl.origin === nextUrl.origin &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search &&
    currentUrl.hash !== nextUrl.hash
  );
}

export function shouldInterceptLinkNavigation(options: {
  button: number;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target?: string | null;
  download?: string | boolean | null;
  currentUrl: URL;
  nextUrl: URL;
}): boolean {
  if (
    options.button !== 0 ||
    options.metaKey ||
    options.altKey ||
    options.ctrlKey ||
    options.shiftKey
  ) {
    return false;
  }

  if (options.target && options.target !== "_self") {
    return false;
  }

  if (options.download) {
    return false;
  }

  if (options.nextUrl.origin !== options.currentUrl.origin) {
    return false;
  }

  if (isHashOnlyNavigation(options.currentUrl, options.nextUrl)) {
    return false;
  }

  return true;
}

export function toNavigationHref(url: URL): string {
  return url.pathname + url.search + url.hash;
}

export function shouldPrefetchLink(options: {
  target?: string | null;
  download?: string | boolean | null;
  currentUrl: URL;
  nextUrl: URL;
}): boolean {
  return shouldInterceptLinkNavigation({
    button: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    target: options.target,
    download: options.download,
    currentUrl: options.currentUrl,
    nextUrl: options.nextUrl,
  });
}

export function applySearchParams(
  currentUrl: URL,
  updates: SearchParamsUpdate,
): {
  changed: boolean;
  href: string;
} {
  const nextUrl = new URL(currentUrl.href);
  const nextSearch = new URLSearchParams(currentUrl.search);

  for (const [key, value] of Object.entries(updates)) {
    nextSearch.delete(key);

    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        nextSearch.append(key, entry);
      }

      continue;
    }

    nextSearch.set(key, value);
  }

  const nextSearchString = nextSearch.toString();
  nextUrl.search = nextSearchString;

  return {
    changed: nextUrl.search !== currentUrl.search,
    href: toNavigationHref(nextUrl),
  };
}
