import type * as React from "react";

export type LitzClientBindings = {
  usePathname(): string;
  useLocation(): {
    href: string;
    pathname: string;
    search: URLSearchParams;
    hash: string;
  };
  useRequiredRouteLocation(routeId: string): {
    params: Record<string, string>;
    search: URLSearchParams;
    setSearch(
      params: Record<string, string | string[] | null | undefined>,
      options?: {
        replace?: boolean;
      },
    ): void;
  };
  useRequiredRouteStatus(routeId: string): {
    status: unknown;
    pending: boolean;
  };
  useRequiredRouteData(routeId: string): {
    loaderResult: unknown;
    actionResult: unknown;
    data: unknown;
    view: React.ReactNode | null;
  };
  useRequiredRouteActions(routeId: string): {
    retry(): void;
    reload(): void;
    submit(payload: FormData | Record<string, unknown>, options?: unknown): Promise<void>;
  };
  useRequiredResourceLocation(resourcePath: string): {
    params: Record<string, string>;
    search: URLSearchParams;
    setSearch(
      params: Record<string, string | string[] | null | undefined>,
      options?: {
        replace?: boolean;
      },
    ): void;
  };
  useRequiredResourceStatus(resourcePath: string): {
    status: unknown;
    pending: boolean;
  };
  useRequiredResourceData(resourcePath: string): {
    loaderResult: unknown;
    actionResult: unknown;
    data: unknown;
    view: React.ReactNode | null;
  };
  useRequiredResourceActions(resourcePath: string): {
    retry(): void;
    reload(): void;
    submit(payload: FormData | Record<string, unknown>, options?: unknown): Promise<void>;
  };
  useMatches(): Array<{
    id: string;
    path: string;
    params: Record<string, string>;
    search: URLSearchParams;
  }>;
  createRouteFormComponent(routeId: string): React.ComponentType<any>;
  createResourceFormComponent(resourcePath: string): React.ComponentType<any>;
  createResourceComponent(
    resourcePath: string,
    component: React.ComponentType<any>,
  ): React.ComponentType<any>;
};

let clientBindings: LitzClientBindings | null = null;

export function installClientBindings(bindings: LitzClientBindings): void {
  clientBindings = bindings;
}

export function getClientBindings(): LitzClientBindings | null {
  return clientBindings;
}

export function resetClientBindings(): void {
  clientBindings = null;
}
