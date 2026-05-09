import type { RscPluginOptions } from "@vitejs/plugin-rsc";

export interface LitzRouteRule {
  /** Response caching configuration, or `false` to disable. */
  readonly cache?:
    | false
    | {
        /** Time-to-live in seconds for cached responses. */
        readonly maxAge?: number;
        /** Enable stale-while-revalidate caching. */
        readonly swr?: boolean;
        /** Vary by these request headers. */
        readonly varies?: string[];
      };
  /** Additional response headers applied to matching routes. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Redirect matching routes to another path. */
  readonly redirect?:
    | string
    | {
        readonly to: string;
        readonly status?: number;
      };
  /** Pre-render this route at build time. */
  readonly prerender?: boolean;
  /** Proxy matching routes to an upstream URL. */
  readonly proxy?:
    | string
    | {
        readonly to: string;
      };
}

export interface LitzPluginOptions {
  /** Glob patterns for route files. */
  readonly routes?: string[];
  /** Glob patterns for API route files. */
  readonly api?: string[];
  /** Glob patterns for resource files. */
  readonly resources?: string[];
  /** Browser entry imported by Litz's generated client runtime module. */
  readonly clientEntry?: string;
  /** Path to a custom server entry file. */
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
