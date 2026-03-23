import type * as React from "react";

export type VoltClientBindings = {
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
    view: React.ReactNode | null;
  };
  useRequiredRouteActions(routeId: string): {
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
