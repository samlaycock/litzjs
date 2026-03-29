import * as React from "react";

declare global {
  var __litzjsNavigationContext:
    | React.Context<{
        navigate(href: string, options?: { replace?: boolean }): void;
      } | null>
    | undefined;
  var __litzjsLocationContext:
    | React.Context<{
        href: string;
        pathname: string;
        search: URLSearchParams;
        hash: string;
      } | null>
    | undefined;
  var __litzjsMatchesContext:
    | React.Context<
        Array<{
          id: string;
          path: string;
          params: Record<string, string>;
          search: URLSearchParams;
        }>
      >
    | undefined;
}

export function getNavigationContext(): React.Context<{
  navigate(href: string, options?: { replace?: boolean }): void;
} | null> {
  if (!globalThis.__litzjsNavigationContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Litz client navigation is not available in this environment.");
    }

    globalThis.__litzjsNavigationContext = createContext<{
      navigate(href: string, options?: { replace?: boolean }): void;
    } | null>(null);
  }

  return globalThis.__litzjsNavigationContext;
}

export function getLocationContext(): React.Context<{
  href: string;
  pathname: string;
  search: URLSearchParams;
  hash: string;
} | null> {
  if (!globalThis.__litzjsLocationContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Litz client location is not available in this environment.");
    }

    globalThis.__litzjsLocationContext = createContext<{
      href: string;
      pathname: string;
      search: URLSearchParams;
      hash: string;
    } | null>(null);
  }

  return globalThis.__litzjsLocationContext;
}

export function getMatchesContext(): React.Context<
  Array<{
    id: string;
    path: string;
    params: Record<string, string>;
    search: URLSearchParams;
  }>
> {
  if (!globalThis.__litzjsMatchesContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Litz client matches are not available in this environment.");
    }

    globalThis.__litzjsMatchesContext = createContext<
      Array<{
        id: string;
        path: string;
        params: Record<string, string>;
        search: URLSearchParams;
      }>
    >([]);
  }

  return globalThis.__litzjsMatchesContext;
}
