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

When `litz({ server })` is configured, the Vite plugin can infer the app entry from a server entry that exports `createServer({ app })` or `createServer({ app: importedApp })`. The discovered app entry is build-time metadata; the client and server entries still import the runtime `app` object themselves.

`litz({ app })` is available as an escape hatch when inference is not possible, such as when the server entry wraps `createServer(...)` in a helper, exports the server indirectly, or otherwise hides the local app import from static discovery. The discovery code parses local imports and `defineApp(...)` arrays so the route, resource, and API manifests come from the explicit app graph instead of folder placement.

Registered definitions must be statically resolvable: each `routes`, `resources`, and `apiRoutes` entry must be an identifier imported from its definition module (or a top-level `const` alias of one). Lists may be built from top-level `const` arrays, spreads of those arrays (`routes: [...featureRoutes, homeRoute]`), shorthand properties (`defineApp({ routes })`), and spreads of top-level `const` option objects. The build fails with an error naming the offending expression when a registration cannot be resolved, such as a function call, conditional, `let` binding, or definition declared in the app file, because an unresolved registration would ship its server handlers to the client. Because discovery reads declared initializers, `const` bindings used to build registrations may only be copied into other registration bindings or the `defineApp(...)` call: mutating them (`routes.push(...)`, `options.routes = ...`), passing them to functions, aliasing them elsewhere, or exporting them also fails the build. `defineApp(...)` freezes copies of its registration lists, so later changes to the source arrays have no effect.

`defineApp(...)` rejects duplicate route, resource, and API paths. The Vite discovery layer also checks duplicate manifest paths after parsing.

## Routes and Layouts

Routes are created with `defineRoute(path, options)`. The string path is the source of truth for matching and type inference. Route files may be organized anywhere when explicit app registration is used.

Layouts are created with `defineLayout(path, options)`. A route opts into a layout by passing `layout`, and layouts can chain by passing their own parent layout. Runtime dispatch builds the chain from outer layout to route. Layouts can define loaders, input validation, middleware, components, and route-state hooks.

Filesystem discovery scans:

- `src/routes/**/*.{ts,tsx,js,jsx}` for routes and layouts.
- `src/routes/resources/**/*.{ts,tsx,js,jsx}` for resources.
- `src/routes/api/**/*.{ts,tsx,js,jsx}` for API routes.

Files ending in `.client.ts`, `.client.tsx`, `.client.js`, or `.client.jsx` are client boundary companions and are not manifest entries. Generated client manifests import the companion instead of the server module. The server module is still projected for the client as well, because `defineApp(...)` imports it directly and the browser reaches it through the app object, so its server-only handlers stay out of client bundles. For server builds, route-like modules with client companions are projected so client-only exports stay out of server code.

## Manifests and Matching

Route and API manifests are sorted by path specificity before dispatch. Matching uses the shared path matcher and supports named params and wildcard params. Internal requests interpolate the registered path with params before handlers run, so handler `request.url`, `params`, and validated input agree.

In development, Vite file watcher updates manifest entries incrementally for filesystem discovery. Explicit app mode refreshes the full app graph when route-like files change because registration depends on imports from the app entry.
