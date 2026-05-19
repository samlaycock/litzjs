# `view(...)`, RSC, and Flight

`view(node, options?)` lets a loader or action return server-rendered React UI instead of JSON data. Litz uses React Server Components and Flight as a transport for that result; it does not make the whole app an RSC app.

## Result Shape

`view(...)` returns a server result with:

- `kind: "view"`.
- `node`, the React node to render on the server.
- optional `headers`.
- optional `revalidate` keys.

The server response uses `content-type: text/x-component` and Litz metadata headers such as `x-litzjs-kind`, `x-litzjs-status`, `x-litzjs-view-id`, and `x-litzjs-revalidate`.

Client hooks expose Flight results through loader/action view hooks and merged view hooks:

- `route.useLoaderView()`
- `route.useActionView()`
- `route.useView()`
- equivalent layout and resource hooks where supported

View hook results also provide `render()` on the normalized result branch when the caller needs to render from the full result object.

## Renderer Integration

The Vite plugin installs `@vitejs/plugin-rsc` only when `litz({ server })` is configured. It creates virtual RSC entries and a virtual renderer module that calls `renderToReadableStream`.

In production, the RSC environment builds to `dist/server/index.mjs`. The generated server entry imports the user `createServer(...)` export and applies generated runtime options with `__withLitzRuntimeOptions(...)`.

In development, Litz dev middleware loads route, layout, resource, and API modules through Vite. Server handlers can return `view(...)`; the middleware renders the node to a Flight response with the same metadata headers as production.

## Boundaries

Client boundary files use `.client.*` suffixes. The Vite plugin projects route-like modules differently for client and server environments so server handlers are not shipped to the browser and client-only companion exports are not evaluated by the server runtime.

`view(...)` uses the Flight transport, while `data(...)`, `invalid(...)`, and `error(...)` use the configured data serializer. App-level `dataSerializer` applies to route and resource data payloads, including batched loader responses, but not to Flight streams.
