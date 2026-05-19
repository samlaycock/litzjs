import type { RscPluginOptions } from "@vitejs/plugin-rsc";

export interface LitzPluginOptions {
  /** Path to the app entry that calls `defineApp(...)`. */
  readonly app?: string;
  /** Path to a server entry file. Omit to skip the server build. */
  readonly server?: string;
  /** Options forwarded to `@vitejs/plugin-rsc`. */
  readonly rsc?: Omit<RscPluginOptions, "entries" | "serverHandler">;
}

export interface DiscoveredRoute {
  readonly id: string;
  readonly path: string;
  readonly modulePath: string;
  readonly clientModulePath?: string | null;
}

export interface DiscoveredLayout {
  readonly id: string;
  readonly path: string;
  readonly modulePath: string;
  readonly clientModulePath?: string | null;
}

export interface DiscoveredResource {
  readonly path: string;
  readonly modulePath: string;
  readonly clientModulePath?: string | null;
  readonly hasLoader: boolean;
  readonly hasAction: boolean;
  readonly hasComponent: boolean;
}

export interface DiscoveredApiRoute {
  readonly path: string;
  readonly modulePath: string;
  readonly clientModulePath?: string | null;
}
