import type * as React from "react";

import type { SubmitPayload } from "../form-data";

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
    error: unknown;
  };
  useRequiredRouteActions(routeId: string): {
    reload(): void;
    submit(payload: SubmitPayload, options?: unknown): Promise<void>;
  };
  useRequiredResourceLocation(resourcePath: string): {
    params: Record<string, string>;
    search: URLSearchParams;
    setSearch(params: Record<string, string | string[] | null | undefined>): void;
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
    error: unknown;
  };
  useRequiredResourceActions(resourcePath: string): {
    reload(): void;
    submit(payload: SubmitPayload, options?: unknown): Promise<void>;
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

declare global {
  var __litzjsClientBindings: LitzClientBindings | null | undefined;
}

export function installClientBindings(bindings: LitzClientBindings): void {
  globalThis.__litzjsClientBindings = bindings;
}

export function getClientBindings(): LitzClientBindings | null {
  return globalThis.__litzjsClientBindings ?? null;
}

export function resetClientBindings(): void {
  globalThis.__litzjsClientBindings = null;
}
