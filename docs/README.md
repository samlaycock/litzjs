# Litz Implementation Docs

These documents describe the current implementation of Litz for contributors.
They are implementation references, not a project plan.

- [App and Route Discovery](./app-and-route-discovery.md)
- [Loaders, Actions, Resources, and API Routes](./server-handlers.md)
- [`view(...)`, RSC, and Flight](./view-rsc-and-flight.md)
- [Vite Plugin and Build Pipeline](./vite-plugin-and-build.md)
- [Runtime, Deployment, and Error Handling](./runtime-deployment-and-errors.md)

The public API centers on explicit definitions:

- `defineApp(...)` registers routes, resources, API routes, app-level loading behavior, and the optional data serializer.
- `defineRoute(...)` and `defineLayout(...)` define URL-backed route UI and layout chains.
- `defineResource(...)` defines reusable server-backed client state.
- `defineApiRoute(...)` defines raw `Response` API handlers.
- `createServer(...)` owns production request dispatch.
- `litz(...)` wires Vite discovery, development middleware, client projection, RSC integration, and production build output.
