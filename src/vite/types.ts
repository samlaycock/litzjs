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

export interface LitzNitroPluginOptions {
  /** Path to a custom server entry file. Defaults to `src/server.ts` or `src/server/index.ts`. */
  readonly server?: string;
  /**
   * Deployment preset. Determines the server output format and runtime
   * adapter (e.g. `"node-server"`, `"cloudflare-pages"`, `"vercel"`).
   */
  readonly preset?: string;
  /**
   * Per-route rules for caching, headers, redirects, pre-rendering, and
   * proxying. Keys are path patterns (e.g. `"/api/**"`).
   */
  readonly routeRules?: Readonly<Record<string, LitzRouteRule>>;
  /**
   * Compress static assets with gzip, brotli, or zstd. Pass `true` to
   * enable all supported algorithms, or an object to pick individually.
   */
  readonly compressPublicAssets?:
    | boolean
    | {
        readonly gzip?: boolean;
        readonly brotli?: boolean;
        readonly zstd?: boolean;
      };
  /** Base URL path for the application (e.g. `"/app/"`). */
  readonly baseURL?: string;
  /** Generate source maps for the server build. */
  readonly sourcemap?: boolean;
  /** Minify the server build output. */
  readonly minify?: boolean;
  /**
   * Nitro build output directories. Defaults to Vite's standard `dist`
   * directory with `public` and `server` subdirectories.
   */
  readonly output?: {
    /** Final build output directory. */
    readonly dir?: string;
    /** Browser/static asset output directory. */
    readonly publicDir?: string;
    /** Server runtime output directory. */
    readonly serverDir?: string;
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
