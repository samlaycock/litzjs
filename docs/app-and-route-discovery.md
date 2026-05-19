# App and Route Discovery

Litz supports two registration modes. Explicit app registration is the 1.0 path and is preferred for production apps. Filesystem discovery remains available when no app entry is configured.

## Explicit Apps

`defineApp(...)` returns a plain app manifest:

```ts
export const app = defineApp({
  routes: [homeRoute, dashboardRoute],
  resources: [userResource],
  apiRoutes: [healthApi],
});
```

The app object is passed to both client and server entry points:

```ts
mountApp(root, { app });
export default createServer({ app });
```

When `litz({ server })` is configured, the Vite plugin can infer the app entry from a server entry that exports `createServer({ app })`. `litz({ app })` is available when inference is not possible. The discovery code parses local imports and `defineApp(...)` arrays so the route, resource, and API manifests come from the explicit app graph instead of folder placement.

`defineApp(...)` rejects duplicate route, resource, and API paths. The Vite discovery layer also checks duplicate manifest paths after parsing.

## Routes and Layouts

Routes are created with `defineRoute(path, options)`. The string path is the source of truth for matching and type inference. Route files may be organized anywhere when explicit app registration is used.

Layouts are created with `defineLayout(path, options)`. A route opts into a layout by passing `layout`, and layouts can chain by passing their own parent layout. Runtime dispatch builds the chain from outer layout to route. Layouts can define loaders, input validation, middleware, components, and route-state hooks.

Filesystem discovery scans:

- `src/routes/**/*.{ts,tsx,js,jsx}` for routes and layouts.
- `src/routes/resources/**/*.{ts,tsx,js,jsx}` for resources.
- `src/routes/api/**/*.{ts,tsx,js,jsx}` for API routes.

Files ending in `.client.ts`, `.client.tsx`, `.client.js`, or `.client.jsx` are client boundary companions and are not manifest entries. For server builds, route-like modules with client companions are projected so client-only exports stay out of server code and server-only handlers stay out of client bundles.

## Manifests and Matching

Route and API manifests are sorted by path specificity before dispatch. Matching uses the shared path matcher and supports named params and wildcard params. Internal requests interpolate the registered path with params before handlers run, so handler `request.url`, `params`, and validated input agree.

In development, Vite file watcher updates manifest entries incrementally for filesystem discovery. Explicit app mode refreshes the full app graph when route-like files change because registration depends on imports from the app entry.
