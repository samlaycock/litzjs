import * as React from "react";

let navigationContext:
  | React.Context<{
      navigate(href: string, options?: { replace?: boolean }): void;
    } | null>
  | undefined;
let locationContext:
  | React.Context<{
      href: string;
      pathname: string;
      search: URLSearchParams;
      hash: string;
    } | null>
  | undefined;
let matchesContext:
  | React.Context<Array<{
      id: string;
      path: string;
      params: Record<string, string>;
      search: URLSearchParams;
    }> | null>
  | undefined;

export function getNavigationContext(): React.Context<{
  navigate(href: string, options?: { replace?: boolean }): void;
} | null> {
  if (!navigationContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Litz client navigation is not available in this environment.");
    }

    navigationContext = createContext<{
      navigate(href: string, options?: { replace?: boolean }): void;
    } | null>(null);
  }

  return navigationContext;
}

export function getLocationContext(): React.Context<{
  href: string;
  pathname: string;
  search: URLSearchParams;
  hash: string;
} | null> {
  if (!locationContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Litz client location is not available in this environment.");
    }

    locationContext = createContext<{
      href: string;
      pathname: string;
      search: URLSearchParams;
      hash: string;
    } | null>(null);
  }

  return locationContext;
}

export function getMatchesContext(): React.Context<Array<{
  id: string;
  path: string;
  params: Record<string, string>;
  search: URLSearchParams;
}> | null> {
  if (!matchesContext) {
    const createContext = (
      React as typeof React & {
        createContext?: typeof React.createContext;
      }
    ).createContext;

    if (!createContext) {
      throw new Error("Litz client matches are not available in this environment.");
    }

    matchesContext = createContext<Array<{
      id: string;
      path: string;
      params: Record<string, string>;
      search: URLSearchParams;
    }> | null>(null);
  }

  return matchesContext;
}
