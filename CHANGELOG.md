# litzjs

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
