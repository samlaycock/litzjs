# litzjs

## 0.4.0

### Minor Changes

- 8636868: Guard non-runnable RSC dev environments and support Cloudflare fixture builds in clean checkouts.

  The Vite dev middleware now bypasses the in-process resource, route, API, and document handlers when the `rsc` environment has no runnable server module loader. This prevents crashes in non-runnable environments while preserving the existing runnable codepath.

  The root development install now also includes `@cloudflare/vite-plugin`, which keeps the Cloudflare smoke fixture and related production helper tests working in clean CI checkouts.

- 120dc19: Integrate Nitro as the server runtime layer, replacing the custom asset embedding and deployment adapter code. The Vite plugin now includes Nitro's Vite plugin, which provides 25+ deployment presets (Cloudflare Workers, AWS Lambda, Vercel, Node.js, etc.) out of the box. A new `litzjs/server/nitro` export provides `createNitroHandler()` for direct Nitro handler usage. The `embedAssets` option has been removed in favor of Nitro's built-in static asset serving.

  The `litzjs/vite` entry now also exposes `buildLitzApp()` for programmatic production builds so consumers can drive Vite's multi-environment app builder correctly, and production builds clean up intermediate Vite artifacts as part of the build lifecycle so the final output is just Nitro's `.output/public` and `.output/server` directories.

### Patch Changes

- b59b28b: Improve docs-site discoverability with sidebar search, page-level table of contents links, heading
  anchor links, and always-available code copy actions across the documentation experience.
- 871e7cf: Fix docs package name mismatches in installation, Deno, and API reference pages.
- 1df9bf2: Stabilize client HMR for Litz route modules by routing projected route updates through Vite's client
  module graph instead of a blanket full reload.

  The client runtime now preserves HMR-sensitive runtime singletons across module replacement and
  avoids re-importing route modules from the `rsc:update` path, which prevents `useNavigate()` and
  related runtime-context crashes during hot updates.

- 653cc62: Add a zero-to-running First App tutorial to the docs and route the getting-started flow through it before Quick Start.
- 4f4e97e: Document the full installation peer dependency surface and add a compatibility matrix for the supported React, Vite, TypeScript, and RSC plugin versions.
- 4899f73: Restructure the getting started docs flow so newcomers move from installation to quick start before configuration.
- 3504e18: Rewrite the troubleshooting docs around concrete symptoms, failure signatures, and direct fixes for
  package naming, route discovery, missing server wrappers, transport wiring, and deployment setup.
- 1482693: Expand the API reference into a complete public surface guide covering the full `litzjs`, `litzjs/client`, `litzjs/server`, and `litzjs/vite` export set.
- 3193c71: Fix docs-site package and repository naming inconsistencies across navigation copy and external links.
- 1bcd10a: Tighten the Node, Bun, Cloudflare Workers, and Deno deployment guides with production-oriented
  adapter recipes, concrete build and deploy commands, and explicit asset-serving caveats.
- bc7a823: Honor Vite's configured `base` for internal client transport URLs, generated browser imports, and Vite/server request routing so apps keep working when mounted under a subpath.
- eeee078: Load dev API route modules through the selected Vite RSC environment runner so API handlers see the same bindings and transforms as routes and resources.
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
