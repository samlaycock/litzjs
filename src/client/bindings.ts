import type * as React from "react";

export type VoltClientBindings = {
  useRequiredRouteRuntime(routeId: string): {
    loaderResult: unknown;
    actionResult: unknown;
    status: unknown;
    pending: boolean;
    params: Record<string, string>;
    search: URLSearchParams;
    setSearch(
      params: Record<string, string | string[] | null | undefined>,
      options?: {
        replace?: boolean;
      },
    ): void;
    retry(): void;
    reload(): void;
    submit(payload: FormData | Record<string, unknown>, options?: unknown): Promise<void>;
    view: React.ReactNode | null;
  };
  useMatches(): Array<{
    id: string;
    path: string;
    params: Record<string, string>;
    search: URLSearchParams;
  }>;
  createRouteFormComponent(routeId: string): React.ComponentType<any>;
  useResourceLoader(resourcePath: string, request?: unknown): unknown;
  useResourceAction(resourcePath: string, request?: unknown): unknown;
};

let clientBindings: VoltClientBindings | null = null;

export function installClientBindings(bindings: VoltClientBindings): void {
  clientBindings = bindings;
}

export function getClientBindings(): VoltClientBindings | null {
  return clientBindings;
}

export function resetClientBindings(): void {
  clientBindings = null;
}
