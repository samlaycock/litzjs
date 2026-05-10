# litzjs

## 0.4.0

### Minor Changes

- 8636868: Guard non-runnable RSC dev environments and support Cloudflare fixture builds in clean checkouts.

  The Vite dev middleware now bypasses the in-process resource, route, API, and document handlers when the `rsc` environment has no runnable server module loader. This prevents crashes in non-runnable environments while preserving the existing runnable codepath.

  The root development install now also includes `@cloudflare/vite-plugin`, which keeps the Cloudflare smoke fixture and related production helper tests working in clean CI checkouts.

- 6254cef: Add explicit `*.client.*` route module boundaries for browser manifests.

  Route, layout, resource, and API modules can now place client-safe definitions in a sibling
  `*.client.ts`, `*.client.tsx`, `*.client.js`, or `*.client.jsx` file. The Vite client manifests
  prefer those files and skip the legacy AST projection transform for the paired server module,
  leaving projection as a compatibility path only for modules without an explicit client boundary.

- 0cb767e: Stop inferring the browser entry from HTML module scripts. Litz now uses an explicit `clientEntry`
  option, defaulting to `src/main.tsx`, and leaves explicit MPA HTML document requests for Vite to
  serve while retaining `index.html` fallback for extensionless app routes during development.
- ca964c4: Replace custom server entry injection with explicit manifest and base wiring.

  Custom server entries now import `serverManifest` from `virtual:litzjs:server-manifest` and `base` from `virtual:litzjs:base`, then pass both to `createServer({ base, manifest: serverManifest })` directly. Existing custom server entries must be updated to include those explicit imports; otherwise they will continue to call `createServer` with an empty manifest. The Vite plugin still generates a default server entry with explicit manifest and base wiring when no custom server entry is configured, but it no longer rewrites user server files or rejects indirect `createServer` wrappers.

- 120dc19: Integrate Nitro as the server runtime layer, replacing the custom asset embedding and deployment adapter code. The Vite plugin now includes Nitro's Vite plugin, which provides 25+ deployment presets (Cloudflare Workers, AWS Lambda, Vercel, Node.js, etc.) out of the box. A new `litzjs/server/nitro` export provides `createNitroHandler()` for direct Nitro handler usage. The `embedAssets` option has been removed in favor of Nitro's built-in static asset serving.

  The `litzjs/vite` entry now also exposes `buildLitzApp()` for programmatic production builds so consumers can drive Vite's multi-environment app builder correctly, and production builds clean up intermediate Vite artifacts as part of the build lifecycle so the final output is just Nitro's `.output/public` and `.output/server` directories.

- 4f309fe: Move Nitro production output behind the explicit `litzNitro()` adapter exported from `litzjs/vite/nitro`, leaving the core `litz()` Vite plugin free of the required Nitro plugin path.
- 827af6e: Refactor route pathname matching to follow URLPattern pathname semantics. This is a breaking change that replaces the custom pathname matcher with native `URLPattern` behavior.

  **Breaking changes:**

  - Route syntax now uses URLPattern pathname syntax instead of Litz-specific syntax
  - Wildcard routes: `/docs/*slug` becomes `/docs/:slug*`
  - Trailing slashes are now significant (matching native URLPattern behavior)
  - Route params are now raw matched substrings (not decoded) - `%2F` stays `%2F`, `%20` stays `%20`
  - Malformed percent-encoding no longer causes automatic route non-match or 400 response
  - Optional groups: `:id?` syntax supported
  - Regex groups: `:id(\d+)` syntax supported
  - Repeat groups: `:id*` and `:id+` syntax supported

  **Migration guide:**

  - Replace all `*name` wildcard patterns with `:name*` (e.g., `/files/*path` → `/files/:path*`)
  - Update any code that relied on automatic param decoding - params are now raw
  - Remove any custom malformed percent-encoding validation for route matching
  - Update tests to account for trailing slash sensitivity

### Patch Changes

- b59b28b: Improve docs-site discoverability with sidebar search, page-level table of contents links, heading
  anchor links, and always-available code copy actions across the documentation experience.
- 75ce252: Move normal client runtime state off `globalThis` and configure base URL, client bindings, and React contexts through module-local runtime state.
- 871e7cf: Fix docs package name mismatches in installation, Deno, and API reference pages.
- 471e78e: Add Playwright E2E coverage for smoke fixture dev server, navigation, API/resource routes, and resource HMR behavior.
- 92ec8cc: Expand the RSC smoke fixture to cover custom Vite and Nitro plugin options, createServer and mountApp option variants, runtime input validation, navigation link variants, API route variants, and offline route options.
- 1df9bf2: Stabilize client HMR for Litz route modules by routing projected route updates through Vite's client
  module graph instead of a blanket full reload.

  The client runtime now preserves HMR-sensitive runtime singletons across module replacement and
  avoids re-importing route modules from the `rsc:update` path, which prevents `useNavigate()` and
  related runtime-context crashes during hot updates.

- 653cc62: Add a zero-to-running First App tutorial to the docs and route the getting-started flow through it before Quick Start.
- 46a7cd3: Fix server manifest injection silently missing namespace import call shapes.

  The `injectServerManifestIntoServerEntry` transform now handles `import * as ns from "litzjs/server"` followed by `ns.createServer()` calls, in addition to the previously supported named import form. It also throws a descriptive error when a `litzjs/server` import is detected but no `createServer()` call can be located and transformed, replacing the previous silent non-injection that produced incorrectly wired builds.

- 9f0445b: Fix dev and production smoke regressions where root document routes could return `Not Found` and resource HMR could keep rendering stale server view results. Nitro builds now bundle the resolved RSC server entry and serve the app document fallback, dev document middleware handles `/`, and resource HMR invalidates active resource caches so edits to resource files update without a full refresh.
- 4f4e97e: Document the full installation peer dependency surface and add a compatibility matrix for the supported React, Vite, TypeScript, and RSC plugin versions.
- 4899f73: Restructure the getting started docs flow so newcomers move from installation to quick start before configuration.
- 3504e18: Rewrite the troubleshooting docs around concrete symptoms, failure signatures, and direct fixes for
  package naming, route discovery, missing server wrappers, transport wiring, and deployment setup.
- 9162be0: Keep route and resource runtime React contexts on `globalThis` so HMR-updated modules continue sharing the mounted runtime providers.
- 49860ac: Tighten Vite HTML entry discovery so unsupported configurations fail fast instead of producing partial client builds.

  The Vite integration now allows multiple HTML entry files only when they all share the same external module script, which matches the current single-client-entry runtime model. Projects that use inline module scripts or different external entry modules per HTML file now receive a clear configuration error during startup instead of silently building an incomplete client bundle.

- 9ae1ee7: Align the setup and API surface by documenting `nitro` as a required peer dependency, adding a
  `baseUrl` escape hatch to `defineApiRoute().fetch()` for server-side callers, attaching lightweight
  marker metadata in `server(...)`, and making `invalid()` accept an omitted options object.
- 1482693: Expand the API reference into a complete public surface guide covering the full `litzjs`, `litzjs/client`, `litzjs/server`, and `litzjs/vite` export set.
- 8fa3acd: Extend dev watcher and HMR to cover `.js` and `.jsx` route-like modules.

  Previously, the default manifest glob patterns only matched `.ts` and `.tsx` files, and the `hotUpdate()` hook filtered on the same extensions. This meant `.js` and `.jsx` route, resource, and API files were discovered at startup (AST parsing supports all four extensions) but were silently ignored during file edits.

  The default patterns for routes, resources, and API routes now include `.js` and `.jsx`, and the `hotUpdate()` extension guard is expanded to match, so edits to JavaScript route modules trigger watch refresh and client hot-update exactly as TypeScript ones do.

- 3193c71: Fix docs-site package and repository naming inconsistencies across navigation copy and external links.
- c8c6661: Warn when matched route-like files import Litz discovery factories but do not export the expected static binding.

  The Vite plugin now reports actionable discovery warnings for near-miss route, layout, resource, and API modules that import `defineRoute`, `defineLayout`, `defineResource`, or `defineApiRoute` from `litzjs` but either omit the required export name or use a path that cannot be read statically.

- c4c01e3: Keep the mounted route module active during same-route search parameter updates so dev runtime
  revalidation cannot replace the page with a missing route export fault.
- 1bcd10a: Tighten the Node, Bun, Cloudflare Workers, and Deno deployment guides with production-oriented
  adapter recipes, concrete build and deploy commands, and explicit asset-serving caveats.
- bc7a823: Honor Vite's configured `base` for internal client transport URLs, generated browser imports, and Vite/server request routing so apps keep working when mounted under a subpath.
- 6577679: Split the internal Vite plugin implementation into focused modules.

  `src/vite.ts` now remains the orchestration entrypoint while filesystem discovery, virtual module generation, HMR helpers, dev middleware, path utilities, shared types, and virtual IDs live in dedicated internal modules. Public exports and runtime behavior are unchanged.

- eeee078: Load dev API route modules through the selected Vite RSC environment runner so API handlers see the same bindings and transforms as routes and resources.
- 5a465b4: Reduce the default install peer surface by keeping `@vitejs/plugin-rsc` and `typescript` as implementation dependencies while documenting only React, React DOM, and Vite as the core app-provided packages. Clarify that Nitro is only needed for the optional `litzNitro()` adapter.
- 58260ee: Rewrite the testing docs around Bun-first, runnable examples and align the integration guidance with the real `createServer().fetch()` API.

## 0.3.0

### Minor Changes

- ac56be6: Add managed client navigation scroll restoration and focus handoff, with `mountApp()` opt-outs for apps that need to control scroll or focus behavior themselves.

### Patch Changes

- 549c863: Support manifest discovery for route, layout, resource, and API exports that are re-exported or wrapped around their `define*` calls.
- f1a1fa4: Guard route and API path matching against malformed percent-encoding so invalid path segments return clean 400 or unmatched results instead of throwing `URIError`.
- 10dc311: Normalize invalid client loader and action responses into route faults so non-JSON bodies and malformed JSON no longer surface raw parse errors.
- 09a9ff9: Keep settled client resource entries warm across real remounts by retaining them in the cache until idle-entry pruning evicts them.
- 879761b: Avoid rebuilding a fresh TypeScript program for each client module projection by tracing top-level dependencies directly from the module AST.
- 032b48c: Add first-class custom not-found handling to `mountApp()` and `createServer()` so apps can override unmatched client and server 404 responses.
- cf64464: Make client route and resource submits abortable and ignore stale results after newer submits, navigation, or unmount.
- 1c73571: Handle lazy client route module load failures as managed route faults so rejected imports and missing `route` exports render the framework error state instead of surfacing unhandled errors.
- c0d1062: Batch internal route loader requests so layout and route loader chains can reuse one client round-trip while preserving ordered loader results and falling back to individual fetches when batching is unavailable.

## 0.2.0

### Minor Changes

- be2e0f5: Remove the legacy `pendingComponent` API, rename route and layout `errorComponent` to `errorBoundary`, and align route, layout, and resource error hooks around explicit `error()` results and fault-only boundaries.

  Routes and layouts now render immediately while loaders settle, explicit loader `error()` results are exposed through `useLoaderError()` and merged `useError()`, and uncaught loader or action throws now consistently surface as sanitized `fault` results in production so `errorBoundary` handling matches development.

- 3082e58: Add first-class `input` parsing hooks for routes, layouts, resources, and API routes so handlers can receive validated params, search params, headers, and request bodies through `context.input`.
- 8fb9d5a: Add configurable link prefetch strategies with optional route loader data warmup.
- bf38f7b: Add an explicit `formJson(...)` helper for structured submit payload fields and reject implicit object/null coercion in `FormData` submissions.

### Patch Changes

- c586872: Warn when `mountApp(...)` receives the removed positional wrapper API and update the README wrapper examples to the current options-object form.
- 769ad56: Preserve repeated query parameters across API fetches, internal route/resource transport, and cache keys.
- d9cdc89: Remove the unused `replace` option from resource-scoped `useSearch()` so its public signature matches the request-local behavior implemented by the runtime.
- bc1957d: Fix client-side matching and prefetch for wildcard routes in the route manifest.
- 1a69346: Implement the documented `offline` route option in the client runtime. Routes with `preserveStaleOnFailure: true` now preserve stale cached data and report an `offline-stale` status when loader requests fail, and routes with a `fallbackComponent` render it when no cached data is available during a failure.
- c6599e5: Fix wildcard path interpolation for internal route and resource requests, plus `defineApiRoute(...).fetch()`.
- 887a9f4: Keep resource loader revalidation and action submits isolated when they overlap for the same cache key.

## 0.1.0

### Minor Changes

- 2be0cb4: Simplify the production server build pipeline. The RSC environment now uses `codeSplitting: false` to produce a single-file server bundle directly, eliminating the subprocess re-bundling step (`bundleServerWrapper`). Removes the `node:async_hooks` shim in favour of the native module. Exposes RSC plugin options via `litz({ rsc: { ... } })` for configuring encryption, CSS transforms, and other `@vitejs/plugin-rsc` settings.
- 5918ad1: Add wildcard/catch-all route support to path matching

  Routes can now use `*` or `*paramName` as a terminal segment to match any number of remaining path segments:

  - `defineRoute("/docs/*slug", { ... })` — captures remaining path as `slug`
  - `defineRoute("/admin/*", { ... })` — catch-all without a named param

  Wildcard routes rank below static and dynamic segments in specificity sorting, so more specific routes always take priority.

### Patch Changes

- 7871b15: Wire dev server AbortController to the HTTP request lifecycle so that handler signals abort when the client disconnects. Previously, resource, route, and API handlers received a disconnected AbortSignal that was never aborted, causing long-running handlers to continue executing after the client navigated away. The fix listens for the Node.js IncomingMessage `close` event and calls `controller.abort()`, matching the production server behavior that uses `request.signal`.
- c628f85: Abort stale route loader fetches on navigation. Previously, navigating away while loaders were in-flight only set a `cancelled` boolean — the underlying HTTP requests continued to completion in the background, wasting bandwidth and server resources. Now an `AbortController` is created per navigation effect, its signal is threaded through `fetchRouteLoadersInParallel` and `fetchRouteLoader` to the native `fetch` call, and the controller is aborted in the effect cleanup. The same pattern is applied to `reloadCurrentRoute`.
- 3547214: Clean up orphaned intermediate build artifacts from the server output directory after finalization. The `@vitejs/plugin-rsc` multi-environment build leaves behind `assets/` chunks and `__vite_rsc_*` helper files that are consumed during the finalization step but not removed. After this change, `dist/server/` contains only the self-contained `index.js`.
- 9fb3c98: Extract the duplicated client `sortRecord` helper into a shared module and cover it with a focused unit test. This keeps route cache key generation and resource cache key generation aligned without changing runtime behaviour.
- 25707d3: Fix header name mismatch between server and client that broke RSC view status codes and revalidation targets. The client was reading `x-litz-status` and `x-litz-revalidate` headers instead of the correct `x-litzjs-status` and `x-litzjs-revalidate` set by the server.
- b8d7c1a: Optimize dev server manifest refresh to avoid re-reading all route files on every file change

  Previously, every `.ts/.tsx` file change triggered a full re-discovery of all routes, layouts, resources, and API routes — running 4 glob operations and reading every matched file from disk. This caused noticeable dev server lag on projects with many route files.

  Now the dev server:

  - Filters changes by glob pattern first, skipping files that can't affect manifests (e.g., utility modules, components)
  - Performs incremental single-file updates on `change` events, only re-reading the one file that changed
  - Reserves full re-discovery for `add`/`unlink` events where new manifest entries may appear or old ones may be removed
  - Debounces `add`/`unlink` events to batch rapid changes (e.g., during `git checkout`) into a single discovery pass

- f4f29bc: Fix dev server leaking raw error messages to clients in fault responses. The resource, route, and API handler catch blocks now return generic error messages instead of forwarding `error.message`, matching the production server behavior. Full errors are still logged to the terminal via `console.error` for debugging.

  Also fix a related issue in the production server where unhandled errors from route and resource handlers could bypass the top-level error masking due to missing `await` on the handler return statements.

- df1c8d6: Fetch route loaders in layout chains concurrently using `Promise.allSettled` instead of sequentially. For a chain of depth N, load time is now the max of all loader durations instead of the sum, eliminating the waterfall latency.
- 30b41e0: Defer resource store entry cleanup via `queueMicrotask` to prevent eviction during React's synchronous unsubscribe/resubscribe cycles. Previously, `cleanupResourceEntry` deleted entries immediately when `listeners.size` reached zero, which could race with React strict mode's double-mount or concurrent rendering transitions. The deferred cleanup re-checks the listener count after the microtask, allowing React to re-subscribe before the entry is removed.
- 94e2e4b: Lock in route-level CSS code splitting with build regression coverage so lazy route chunks keep their own extracted stylesheets.
