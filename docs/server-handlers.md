# Loaders, Actions, Resources, and API Routes

Server-backed behavior is explicit. Route loaders, route actions, layout loaders, resource loaders/actions, and API route handlers are registered by their definitions and run through the Litz server dispatch layer.

## Route Loaders and Actions

`defineRoute(...)` accepts:

- `component` for route UI.
- `loader` for server data or server-rendered view state.
- `action` for form submissions and imperative writes.
- `layout` for parent layout composition.
- `input` for params, search, headers, and body parsing.
- `middleware` for per-route request handling and context overrides.

Handlers are normally wrapped in `server(...)`. The wrapper marks the function as a server handler for projection and typing. Loaders and actions receive `{ request, params, signal, context, input }`.

The client runtime fetches route loaders through `/_litzjs/route` and route actions through `/_litzjs/action`. Loader requests can batch multiple route/layout targets. Batched route loaders support `data(...)`, `redirect(...)`, `error(...)`, and `fault` results; `view(...)` is intentionally not batched because Flight streams are independent transport responses.

Route hooks are source-aware. Loader hooks read loader state, action hooks read action state, and merged hooks expose the latest settled data, view, or explicit error.

## Resources

`defineResource(path, options)` creates reusable server-backed client state. A resource always has a `component`; each rendered `<resource.Component />` creates a scoped resource instance. The instance provides params, request-scoped search state, loader/action state, reload, submit, and `resource.Form`.

Resources dispatch through `/_litzjs/resource` with an operation of `loader` or `action`. Resource search updates are local to the resource request and do not mutate browser history. Resource state is keyed by resource path and request identity so repeated instances can share runtime state when their inputs match.

## API Routes

`defineApiRoute(path, handlers)` registers raw API handlers. Handlers return `Response` and may define method keys such as `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, or `ALL`.

API dispatch matches the request pathname against the sorted API manifest. `HEAD` falls back to `GET` when no explicit `HEAD` handler exists, and Litz strips the body from the returned response. Unsupported methods return `405 Method Not Allowed` with an `Allow` header when the allowed methods are known.

`api.fetch(...)` builds a typed client request URL from the registered path, params, search, method, and optional base URL.

## Input and Middleware

Routes, layouts, resources, and API routes can define `input` parsers for `params`, `search`, `headers`, and `body`. Parsers can return typed values or short-circuit by throwing Litz result helpers.

Middleware runs in order before input validation and the final handler. Middleware receives `{ request, params, signal, context }` and `next(...)`. `next({ context })` replaces context for downstream middleware and the handler.
