# Runtime, Deployment, and Error Handling

The production runtime is created with `createServer(options)`. It exposes a Fetch-compatible `fetch(request)` method and can be adapted to Node, Bun, Deno, Cloudflare Workers, or any host that can forward Fetch `Request` objects.

## Request Dispatch

`createServer(...)` normalizes the configured base path and dispatches requests in this order:

- internal resource requests at `/_litzjs/resource`.
- internal route/action requests at `/_litzjs/route` and `/_litzjs/action`.
- API routes from the registered API manifest.
- static assets through an optional `assets(request)` hook.
- app document or not-found document for `GET` and `HEAD` navigations.
- plain `404 Not Found`.

The Vite build outputs client assets to `dist/client` and the server module to `dist/server/index.mjs`. Hosts should serve immutable client assets directly and forward Litz internals, API routes, and document requests to `app.fetch(request)`.

## Internal Request Validation

`validateInternalRequest` runs before route and resource loader/action dispatch. It receives the request kind, operation, registered path, parsed internal body, and context. It can return a `Response` to reject the internal request before middleware, input validation, or handlers run.

This is the right hook for deployment-specific CSRF, origin, auth, or capability checks around route and resource actions.

## Results, Headers, and Revalidation

Handlers return Litz result helpers:

- `data(value, options?)`
- `view(node, options?)`
- `invalid(options?)`
- `redirect(location, options?)`
- `error(status, message, options?)`

`withHeaders(...)` merges headers into either a Litz result or a raw `Response`. `revalidate` keys are serialized into Litz metadata headers so the client runtime knows which cached route or resource state should refresh.

`redirect(...)` defaults to status `303`; `invalid(...)` defaults to `422`; explicit `error(...)` defaults to the provided status; unhandled faults become `500`.

## Errors and Faults

Explicit `error(...)` results are user-addressable state and appear in route/resource error hooks. Unhandled exceptions are reported to `onError(error, context)` and converted to fault responses. The top-level server catch also calls `onError` and returns a plain `500` response.

Malformed internal requests return a serialized fault response. Malformed path encodings return `400 Bad Request`. API handlers may throw `Response` objects or Litz result helpers; those are converted to API responses.

`HEAD` requests preserve status and headers while dropping response bodies.
