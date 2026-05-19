# Vite Plugin and Build Pipeline

`litz(options)` returns the Litz Vite plugin stack. It is responsible for discovery, development middleware, virtual modules, client/server module projection, RSC wiring, and production build finalization.

## Options

Current plugin options include:

- `server`, the server entry used for server-backed routes, resources, API routes, and `view(...)` responses.
- `app`, an explicit app entry when the app cannot be inferred from `createServer({ app })`.
- `rsc`, options forwarded to `@vitejs/plugin-rsc`.

The browser entry is the standard Vite `index.html` module script. Litz reads it and creates a virtual browser entry that imports the app entry and calls `configureClientRuntime({ baseUrl })`.

## Virtual Modules

The plugin provides virtual modules for:

- route and layout manifests.
- resource manifests.
- generated browser entry.
- generated RSC entry.
- RSC renderer.
- server runtime options.

The server runtime options virtual module contains the generated manifest, document handling, base path, and production runtime metadata that must be applied to the user server export.

## Development

During `configureServer`, the plugin installs middleware for resources, routes/actions, API routes, and document fallback handling. It also watches route-like files and invalidates manifest virtual modules when discovery changes.

Hot updates for projected route-like modules are collected from the client module graph so route components and client companions update without exposing server-only code.

## Production Build

When `server` is configured, Litz orchestrates a multi-environment build:

- the client environment emits browser assets and a Vite manifest into `dist/client`.
- the RSC/server environment emits a single server entry at `dist/server/index.mjs`.

The framework finalizer removes transient server bundle artifacts, injects client asset metadata into server runtime options, and keeps the production output aligned with the deployment model. Client-only apps can omit `server`; in that mode Litz does not install the RSC plugin stack or produce the server environment.
