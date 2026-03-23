# Litz — Client-First React Framework with Server-Rendered UI Fragments

## Overview

Litz is a **client-first React framework delivered as a Vite plugin** that enables developers to:

- Build fully client-rendered applications
- Use **server-side logic (loaders/actions)** where needed
- Return **data OR JSX (via React Server Components / Flight)**
- Define routes with **explicit absolute paths**
- Define **reusable server-backed resources**
- Maintain **offline-first compatibility**

---

## Core Philosophy

> **The browser owns the document. The server owns data and renderable fragments.**

Litz is **not SSR-first**. It is:

- A **SPA by default**
- With **opt-in server capabilities**
- Using **RSC as a transport**, not a rendering foundation

---

## V1 Scope

Litz v1 includes:

- Explicit route modules via `defineRoute(...)`
- Explicit API route modules via `defineApiRoute(...)`
- Explicit resource modules via `defineResource(...)`
- Server-only handlers via `server(...)`
- Result helpers: `data`, `view`, `invalid`, `redirect`, `error`
- RSC / Flight support via `view(...)`
- Discovery through Vite plugin configuration
- A default **WinterCG-compatible** server runtime contract
- Per-definition middleware on routes, resources, and API routes

Litz v1 does **not** define yet:

- Layout routes / nested route trees
- Offline action queueing
- Advanced streaming updates
- Global middleware registration

---

## Key Principles

### 1. Client-first

- App shell is always client-rendered
- Navigation is client-side
- Full client bundle exists

### 2. Explicit server boundaries

Server logic only exists in:

- `server(...)`
- `defineRoute(...)`
- `defineResource(...)`
- `defineApiRoute(...)`

Never inside arbitrary components.

Security note:
Those framework boundaries are not private network boundaries. Route loaders/actions, resource
handlers, API routes, and the `/_litz/*` transport must all be treated as normal server request
surfaces by app authors.

### 3. RSC is a transport, not a framework

- Used for `view(...)`
- Never owns the full document
- Always explicit

### 4. Separation of concerns

| Layer      | Responsibility                   |
| ---------- | -------------------------------- |
| Routes     | Navigation + page-level data     |
| Resources  | Local server-backed capabilities |
| API routes | Raw HTTP endpoints               |
| Components | UI + interaction                 |

---

# Installation

```bash
npm install litz
```

```ts
// vite.config.ts
import { litz } from "litz/vite";

export default {
  plugins: [
    react(),
    litz({
      routes: ["src/routes/**/*.{ts,tsx}"],
      api: ["src/routes/api/**/*.{ts,tsx}"],
      resources: ["src/routes/resources/**/*.{ts,tsx}"],
    }),
  ],
};
```

---

## Project Structure

```
src/
  app.ts
  root.tsx
  routes/
    home.tsx
    projects.tsx
    project-detail.tsx
    api/
      projects.ts
    resources/
      user-search.ts
  features/
    billing/
      routes/
        billing-home.tsx
```

Filesystem structure is for organization only.

Litz discovers modules from configured directories or globs.

Route, API route, and resource identity come from their exported definitions, not from filenames.

---

## Core APIs

### mountApp

```ts
mountApp(element);
```

A thin helper that mounts the Litz client runtime into a DOM element.

Its job is to:

- bootstrap the client router
- hydrate or render the SPA shell
- connect the client runtime to discovered route/resource manifests

The exact signature can stay minimal in v1.

---

### createServer

```ts
createServer({
  createContext(request) { ... },
  onError(error, context) {}
})
```

Creates the Litz server request handler.

Its job is to:

- create per-request server context
- dispatch discovered routes, resources, and API routes
- normalize Litz results into HTTP responses
- handle application-level errors

---

### defineRoute

```ts
defineRoute(path, {
  component,
  loader?,
  action?,
  middleware?,
  pendingComponent?,
  errorComponent?,
  offline?
})
```

- `path` is an **absolute path**
- Example: `"/projects/:id"`
- Returns a `route` object used by both the runtime and the route module itself

---

### defineApiRoute

```ts
defineApiRoute("/api/projects", {
  middleware?,
  GET: async ({ request }) => Response.json(...),
})
```

---

### defineResource

Reusable server-backed logic:

```ts
defineResource("/resources/user-search", {
  loader: server(async (...) => data(...)),
  action: server(async (...) => data(...))
  middleware?
})
```

- `path` is an **absolute path**
- Resources are addressable for revalidation by path, the same as routes

---

### server

Marks server-only handlers:

```ts
server(async (ctx) => { ... })
```

`server(...)` is a marker for server-only logic.

It is intended to be passed into Litz-owned boundaries such as route loaders/actions and resource loaders/actions.

---

### LitzRoute

`defineRoute(...)` returns a route object.

That object is both:

- the discovered route definition
- the route-scoped client API surface

For example, a route object can expose:

```ts
type LitzRoute<
  TContext = unknown,
  TLoaderResult extends ServerResult = ServerResult,
  TActionResult extends ServerResult = ServerResult,
> = {
  id: string;
  path: string;

  useLoaderResult(): LoaderHookResult | null;
  useLoaderData(): unknown | null;
  useLoaderView(): React.ReactNode | null;
  useActionResult(): ActionHookResult | null;
  useActionData(): unknown | null;
  useActionView(): React.ReactNode | null;
  useActionError(): unknown | null;
  useInvalid(): unknown | null;
  useData(): unknown | null;
  useView(): React.ReactNode | null;
  useError(): unknown | null;
  useStatus(): RouteStatus;
  usePending(): boolean;
  useParams(): Record<string, string>;
  useSearch(): [URLSearchParams, SetSearchParams];
  useRetry(): () => void;
  useReload(): () => void;
  useSubmit(opts?: SubmitOptions): (payload: FormData | Record<string, unknown>) => Promise<void>;

  Form: React.ComponentType<RouteFormProps>;
};
```

This means route modules can use the returned `route` value directly inside their components and hooks.

### DefineRouteOptions

```ts
type DefineRouteOptions<
  TContext = unknown,
  TLoaderResult extends ServerResult = ServerResult,
  TActionResult extends ServerResult = ServerResult,
> = {
  component: React.ComponentType;
  loader?: ServerHandler<TContext, TLoaderResult>;
  action?: ServerHandler<TContext, TActionResult>;
  middleware?: MiddlewareRef<TContext, ServerResult>[];
  pendingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: RouteErrorLike }>;
  offline?: {
    fallbackComponent?: React.ComponentType;
    preserveStaleOnFailure?: boolean;
  };
};
```

The type surface may expand, but this captures the intended v1 route contract.

---

## Handler Context

Litz server handlers receive a context object.

The initial v1 handler context includes:

- `request: Request`
- `params: Record<string, string>`
- `signal: AbortSignal`
- `context`

Additional fields may be added later, but these are the initial core contract.

### Route loader / action context

```ts
type RouteHandlerContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext;
};
```

### Resource loader / action context

```ts
type ResourceHandlerContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext;
};
```

Resources receive params parsed from the resource path pattern.

Resources use the same path parameter syntax as routes.

### API route handler context

```ts
type ApiHandlerContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext;
};
```

---

## Result Helpers

### data

```ts
data(value, { headers, status, revalidate });
```

### view

```tsx
view(<JSX />, { headers, revalidate });
```

Returns a React Server Component fragment.

`view(...)` can wrap any JSX that is valid for Litz's server-rendered fragment pipeline.

That fragment is sent to the client using the RSC / Flight wire format and displayed by the client runtime.

### invalid

```ts
invalid({ fields, formError });
```

### redirect

```ts
redirect("/path", { replace, revalidate });
```

### error

```ts
error(status, message);
```

`headers` accepts `HeadersInit`.

Each loader, action, or resource handler returns exactly **one** result kind per invocation.

---

## Hook Result Types

### LoaderHookResult

```ts
type LoaderHookResult =
  | {
      kind: "data";
      status: number;
      headers: Headers;
      stale: boolean;
      data: unknown;
      render(): React.ReactNode;
    }
  | {
      kind: "view";
      status: number;
      headers: Headers;
      stale: boolean;
      node: React.ReactNode;
      render(): React.ReactNode;
    };
```

`useLoaderResult()` returns the normalized result of the most recent loader execution, or `null`
while the route has no settled loader result yet.

Both result variants expose `render()` so route components can render the current loader result without branching on `kind` first.

`render()` returns:

- the current server-rendered fragment for `kind: "view"`
- `null` for `kind: "data"`

`useLoaderView()` returns the current loader-backed `view()` node, or `null`.

`useView()` returns the latest settled `view()` node from either the loader or the action, or `null`.

That merged value is visible through:

- `route.useView()`
- `route.useActionView()`
- `route.useLoaderView()`

### ActionHookResult

```ts
type ActionHookResult =
  | null
  | {
      kind: "invalid";
      status: number;
      headers: Headers;
      fields?: Record<string, string>;
      formError?: string;
      data?: unknown;
    }
  | {
      kind: "data";
      status: number;
      headers: Headers;
      data: unknown;
    }
  | {
      kind: "view";
      status: number;
      headers: Headers;
      node: React.ReactNode;
      render(): React.ReactNode;
    }
  | {
      kind: "redirect";
      status: number;
      headers: Headers;
      location: string;
      replace: boolean;
    }
  | {
      kind: "error";
      status: number;
      headers: Headers;
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      status: number;
      headers: Headers;
      message: string;
      digest?: string;
    };
```

`error` represents an expected application-level failure.

`fault` represents an unexpected runtime failure that escaped normal handler control flow.

For `kind: "view"`, `render()` returns the returned server fragment.

### RouteStatus

```ts
type RouteStatus = "idle" | "loading" | "submitting" | "revalidating" | "offline-stale" | "error";
```

### SubmitOptions

```ts
type SubmitOptions = {
  onBeforeSubmit?: (formData: FormData) => void;
  onSuccess?: (result: ActionHookResult) => void;
  onError?: (result: Extract<ActionHookResult, { kind: "error" | "fault" }>) => void;
};
```

---

## Routing System

### Discovery

Litz does not use filesystem-based routing as the source of truth.

Instead, the Vite plugin scans configured directories or globs and discovers modules that export:

- `route`
- `api`
- `resource`

---

### Route module export

```ts
import { defineRoute, server, data } from "litz"

export const route = defineRoute("/projects/:id", {
  component: ProjectPage,
  loader: server(async ({ context, params }) => {
    const project = await context.db.projects.get(params.id)

    return data({ project })
  })
})

function ProjectPage() {
  const project = route.useLoaderData()
  const params = route.useParams()
  const view = route.useView()

  return (
    <main>
      <h1>Project {params.id}</h1>
      {view ?? (project ? <ProjectSummary project={project.project} /> : null)}
    </main>
  )
}
```

---

### API route module export

```ts
import { defineApiRoute } from "litz";

export const api = defineApiRoute("/api/projects", {
  GET: async ({ context }) => {
    const projects = await context.db.projects.list();
    return Response.json({ projects });
  },
});
```

---

### Resource module export

```ts
import { defineResource, server, data } from "litz";

export const resource = defineResource("/resources/user-search", {
  loader: server(async ({ request, context }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";

    const users = await context.db.users.search(q);

    return data({ users });
  }),
});
```

---

### Route matching

Routes are matched by the `path` declared in `defineRoute(...)`.

Paths are absolute and do not depend on file location.

---

## Route Lifecycle

### Navigation

1. Match route
2. Execute loader if present
3. Normalize result
4. Render route component

Routes without a loader remain fully client-side and do not require a server request for initial route state.

---

### Loader return types

- `data(...)` → JSON data
- `view(...)` → RSC fragment
- `redirect(...)` → Client redirect
- `error(...)` → Route error state

A loader returns one of these results for a single request.

When a loader returns `view(...)`, the route component remains client-rendered.

The returned fragment becomes part of the route's route-state and is accessible through:

- `route.useLoaderView()`
- `route.useView()`

Litz does not replace the route component implicitly.

Only `data(...)` and `view(...)` become `LoaderHookResult` values.

`redirect(...)` interrupts navigation and does not produce a loader result.

`error(...)` transitions the route into an error state rather than producing a `LoaderHookResult` value.

---

### Action lifecycle

1. Submit form
2. Optional optimistic update
3. Execute action
4. Handle result:
   - data → update action state
   - invalid → show errors
   - view → update route view state and action state
   - redirect → navigate
   - error / fault → transition into route error handling

An action returns one result kind for a single submission.

Action results surface as follows:

- `invalid`, `data`, `view`, `redirect`, and `error` populate `route.useActionResult()`
- `route.useInvalid()`, `route.useActionData()`, `route.useActionView()`, and `route.useActionError()` expose branch-specific derived values
- `route.useData()`, `route.useView()`, and `route.useError()` expose the latest settled merged value for the route
- `fault(...)` uses the normal route error boundary path instead of a client hook surface

This lets a route keep separate loader and action state while still reading a simple merged value when that is all the component needs.

---

## Forms (React 19)

```tsx
<route.Form>
  <input name="name" />
</route.Form>
```

`route.Form` is always bound to the current route's action.

The user does not provide `action` or `method`.

Internally, `route.Form` uses React 19 form actions, so descendants can use
`useFormStatus()` directly.

If a route does not define an action, submitting `route.Form` is a runtime error in development and unsupported in production.

Hooks:

```ts
route.useActionResult();
route.useActionData();
route.useActionView();
route.useActionError();
route.useInvalid();
route.useSubmit();
route.usePending();
```

The `route` object used here is the value returned by `defineRoute(...)`.

### Submit example

```ts
const submit = route.useSubmit(opts?)

await submit(formData)
await submit({ name: "Alpha" })
```

`route.useSubmit()` targets the current route's action.

If the route has no action, calling `useSubmit()` is a runtime error in development and unsupported in production.

When a plain object is passed to `submit(...)`, Litz serializes it to `FormData`.

The v1 coercion rules should support at least:

- `string`
- `number`
- `boolean`
- `File`
- arrays of those values

### RouteFormProps

```ts
type RouteFormProps = Omit<React.ComponentPropsWithoutRef<"form">, "action" | "method"> & {
  replace?: boolean;
  revalidate?: boolean | string[];
  optimisticKey?: string;
};
```

---

## Resource System

### Definition

```ts
const resource = defineResource("/resources/search", {
  loader: server(...)
})
```

Resource paths may include params:

```ts
const resource = defineResource("/resources/user/:id", {
  loader: server(async ({ params, context }) => {
    return data(await context.db.users.get(params.id));
  }),
});
```

---

### Usage

```ts
const state = resource.useLoader({
  params: { id: "123" },
});

state.load({
  params: { id: "123" },
});
```

Resource client calls are serialized into a request before reaching the server handler.

In v1, resource server handlers read their inputs from the generated `Request`.

Resource identity is path-based.

This means `revalidate: string[]` can target resources and routes uniformly.

If a resource path has required params, they must be provided by the calling hook or component.

Missing required params are a runtime error in development and unsupported in production.

---

### Action

```ts
const action = resource.useAction({
  params: { id: "123" },
});

await action.submit(formData, {
  params: { id: "123" },
});
```

### Optional component

Resources may optionally define a packaged client component:

```tsx
const accountMenu = defineResource("/resources/account-menu/:id", {
  loader: server(async ({ params, context }) => {
    const user = await context.db.users.get(params.id);
    return view(<AccountMenuView user={user} />);
  }),
  component: function AccountMenuResource() {
    const result = accountMenu.useLoader({
      params: { id: "123" },
    });

    return <>{result.data}</>;
  },
});
```

When a resource defines `component`, the returned resource exposes:

```ts
resource.Component;
```

Usage:

```tsx
<accountMenu.Component params={{ id: "123" }} />
```

---

### Use cases

- Combobox search
- Inline editing
- Small mutations
- Autocomplete

---

## Middleware

Litz v1 supports per-definition middleware on:

- routes
- resources
- API routes

Middleware executes in declaration order and receives a request pipeline context plus a `next(...)` function.

```ts
type MiddlewareContext<TContext = unknown> = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
  context: TContext;
};

type MiddlewareNext<TContext, TResult> = (overrides?: { context?: TContext }) => Promise<TResult>;

type MiddlewareRef<TContext = unknown, TResult = unknown> = (
  context: MiddlewareContext<TContext>,
  next: MiddlewareNext<TContext, TResult>,
) => Promise<TResult> | TResult;
```

Middleware may:

- continue with `next()`
- explicitly replace or extend `context` with `next({ context })`
- short-circuit by returning a result directly
- observe or transform the downstream result

Route and resource middleware return Litz `ServerResult` values. API route middleware returns `Response`.

Global middleware is deferred until after per-definition middleware is stable.

---

## Error Model

Route errors are normalized into a shared shape used by `errorComponent`.

```ts
type RouteErrorLike =
  | {
      kind: "error";
      status: number;
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      status: number;
      message: string;
      digest?: string;
    };
```

`error(...)` creates an application-level route error.

Unhandled failures become `fault` errors.

---

## Headers & Response Metadata

All results expose:

```ts
result.headers;
result.status;
```

Example:

```ts
const result = route.useLoaderResult();
result?.headers.get("cache-control");
```

---

## App Entry Model

Litz has two entry concerns:

- a **client entry** loaded by Vite from `index.html`
- a **server request handler** that dispatches Litz routes, resources, and API routes

The client entry is required for the SPA shell and client runtime.

The server request handler is required for loaders, actions, resources, API routes, and `view(...)` responses.

### Client entry

`index.html` loads the Litz client runtime through a normal Vite browser entry.

For example:

```html
<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

The browser entry can stay thin:

```ts
import { mountApp } from "litz/client";

mountApp(document.getElementById("app")!);
```

Litz must integrate cleanly with Vite's standard browser entry model.

`mountApp(...)` should remain thin.

It may optionally accept a wrapper component as a second argument. Litz should
render the app as that component's child, so the user can install wrappers such as
`StrictMode` or app-wide providers without replacing Litz's bootstrap:

```tsx
mountApp(document.getElementById("app")!, StrictMode);
```

It should not require the user to pass discovered routes manually.

Instead, the Vite plugin provides generated route/runtime modules through Litz virtual modules, and the `litz/client` entry consumes those automatically.

### Client bootstrap contract

At a high level, `mountApp(...)` does this:

1. Read the generated route runtime from Litz virtual modules
2. Match the current `window.location`
3. Load the matched route module
4. Execute the route loader if needed
5. Normalize the loader result into route state
6. Render the route component into the target element
7. Keep route state in sync across navigation, submission, retry, reload, and revalidation

---

## Server Runtime

The default Litz server runtime is **WinterCG-compatible**.

The app entry contract is:

```ts
export default function handle(request: Request): Response | Promise<Response>;
```

The server entry can also stay thin:

```ts
import { createServer } from "litz/server";

export default createServer({
  createContext(request) {
    return {};
  },
  onError(error) {
    console.error(error);
  },
});
```

Litz's server runtime is responsible for wiring discovered routes, resources, and API routes into that request handler.

The stable runtime target is: `Request -> Response`.

`createServer(...)` should also remain thin.

Like `mountApp(...)`, it should consume generated Litz modules rather than requiring the user to wire discovered definitions together manually.

### Server bootstrap contract

At a high level, `createServer(...)` does this:

1. Read discovered routes, API routes, and resources from Litz virtual modules
2. Create per-request context
3. Match the incoming request to a Litz route, action, resource, or API handler
4. Execute the matched handler with Litz's handler context
5. Normalize the returned Litz result into an HTTP response
6. Catch unhandled failures and convert them into error or fault responses

`createContext(request)` provides the `context` value exposed to route, resource, and API handlers.

### Request dispatch

The server runtime dispatches requests across these categories:

- route loader requests
- route action requests
- resource requests
- API route requests
- client document requests

The exact internal endpoint layout may vary between dev and production, but the runtime contract stays the same.

---

## Wire Protocol

Litz uses two response content types:

- `application/vnd.litz.result+json`
- `text/x-component`

### Normalized JSON result

All non-`view(...)` Litz results normalize to a runtime shape using:

```ts
type NormalizedResult =
  | {
      kind: "data";
      status: number;
      headers: Headers;
      data: unknown;
      revalidate: string[];
    }
  | {
      kind: "invalid";
      status: number;
      headers: Headers;
      fields?: Record<string, string>;
      formError?: string;
      data?: unknown;
    }
  | {
      kind: "redirect";
      status: number;
      headers: Headers;
      location: string;
      replace: boolean;
      revalidate: string[];
    }
  | {
      kind: "error";
      status: number;
      headers: Headers;
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      status: number;
      headers: Headers;
      message: string;
      digest?: string;
    };
```

`NormalizedResult` is the client/runtime representation after Litz parses the HTTP response.

The `headers: Headers` field is reconstructed from the actual HTTP response headers, not serialized as a raw JSON object.

These responses use:

```http
Content-Type: application/vnd.litz.result+json
```

The JSON body carries only Litz payload fields.

Suggested wire shape:

```ts
type LitzJsonBody =
  | {
      kind: "data";
      data: unknown;
      revalidate?: string[];
    }
  | {
      kind: "invalid";
      fields?: Record<string, string>;
      formError?: string;
      data?: unknown;
    }
  | {
      kind: "redirect";
      location: string;
      replace?: boolean;
      revalidate?: string[];
    }
  | {
      kind: "error";
      message: string;
      code?: string;
      data?: unknown;
    }
  | {
      kind: "fault";
      message: string;
      digest?: string;
    };
```

Litz reconstructs the runtime `NormalizedResult` by combining:

- the HTTP status code
- the HTTP response headers
- the parsed JSON body

### JSON response examples

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.litz.result+json
Cache-Control: private, no-store

{
  "kind": "data",
  "data": {
    "user": {
      "id": "u_123",
      "name": "Sam"
    }
  },
  "revalidate": ["/dashboard"]
}
```

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/vnd.litz.result+json

{
  "kind": "invalid",
  "fields": {
    "displayName": "Display name is required"
  }
}
```

### View responses

`view(...)` does not normalize to JSON.

Instead, Litz returns the RSC / Flight payload directly using:

```http
Content-Type: text/x-component
X-Litz-Kind: view
X-Litz-Status: 200
X-Litz-View-Id: routes/projects#loader
X-Litz-Revalidate: /dashboard,/projects
```

Body: Flight stream

The response may also include user-provided headers such as:

```http
Cache-Control: private, no-store
```

### View metadata headers

Litz uses response headers to carry `view(...)` metadata that would otherwise be present in `NormalizedResult`:

- `X-Litz-Kind`
- `X-Litz-Status`
- `X-Litz-View-Id`
- `X-Litz-Revalidate`

This lets Litz preserve a clean RSC body while still exposing status and revalidation metadata to the client runtime.

---

## Vite Plugin Responsibilities

### Responsibilities

- Configured module discovery
- Route discovery
- Resource discovery
- API discovery
- Manifest generation
- Virtual modules
- Dev server endpoints
- Client/server build split

---

### Virtual modules

- `virtual:litz:route-manifest`
- `virtual:litz:resource-manifest`
- `virtual:litz:api-manifest`
- `virtual:litz:router`
- `virtual:litz:client-entry`
- `virtual:litz:server-entry`

---

### Dev Endpoints

```
/_litz/route/*
/_litz/action/*
/_litz/api/*
/_litz/resource/*
```

---

## Manifest Format

### Route manifest

```ts
{
  (id, path, moduleId, hasLoader, hasAction);
}
```

---

### API manifest

```ts
{
  (id, path, methods);
}
```

---

### Resource manifest

```ts
{
  (path, moduleId, hasLoader, hasAction, hasComponent);
}
```

---

## Runtime Architecture

### Core pieces

- Router
- Route state store
- Resource store
- Submission store
- Cache layer

---

### Client runtime responsibilities

The client runtime is responsible for:

- reading the discovered route graph
- matching the current URL
- loading and rendering the active route module
- storing normalized loader, action, and view state for each active route
- driving navigation, submission, retry, reload, and revalidation

`mountApp(...)` is the entry into this runtime.

---

### Route instance

```ts
route.useLoaderResult();
route.useLoaderData();
route.useLoaderView();
route.useActionData();
route.useActionView();
route.useActionError();
route.useInvalid();
route.useData();
route.useView();
route.useError();
route.useActionResult();
route.useStatus();
route.useParams();
route.useSearch();
route.useRetry();
route.useReload();
route.useSubmit();
route.Form;
```

### Route rendering lifecycle

If a route defines `pendingComponent` and there is no resolved route state yet, Litz renders the pending component while the initial loader request is in flight.

If a route is reloading or revalidating and stale route state already exists, Litz keeps the route component mounted and updates:

- `route.useStatus()`
- `route.usePending()`
- `result.stale`

If a loader fails with an `error` or `fault`, Litz renders `errorComponent` when provided.

The `errorComponent` receives a normalized `RouteErrorLike`.

---

### Resource instance

```ts
resource.useLoader({ params });
resource.useAction({ params });
resource.Component;
```

---

## Caching & Revalidation

### Revalidation hints

```ts
return view(..., {
  revalidate: ["/projects"]
})
```

### Runtime behavior

- mark cache stale
- refetch in background

---

## Offline Support

- full client bundle
- stale view fallback
- queued actions (future)

---

## Pre-Build Checklist

These questions should be settled before substantial implementation starts.

### Must answer before building core runtime

- How are route ids generated, and are they stable across dev and build?
- What path syntax is supported in v1 beyond `:param`?
- What is the exact internal request shape for route loaders, route actions, and resources?
- How does a client document request resolve alongside Litz internal endpoints?
- What is the exact TypeScript strategy for typing `context` across route, resource, and API handlers?
- What is the exact route state update algorithm when an action returns `view(...)`?
- What is the default runtime behavior when no `errorComponent` is provided?

### Should answer during early implementation

- What exact API surface does `defineResource(...)` expose on the client?
- How are resource inputs encoded onto the generated `Request`?
- What is the exact difference between `route.useRetry()` and `route.useReload()`?
- How does `revalidate` map to cache keys and refetch timing?
- What exact conditions set `route.usePending()` to `true`?
- How are redirects applied with `replace` and `revalidate` together?

### Can defer until after the first vertical slice

- Middleware behavior
- Offline queueing
- Advanced caching policy
- Additional adapters beyond the default WinterCG target
- Devtools

### Recommended first implementation slice

1. Plain client-only route
2. Route loader returning `data(...)`
3. Route loader returning `view(...)`
4. Route action returning `invalid(...)`
5. Route action returning `view(...)`

This sequence validates the core runtime model before expanding into resources, offline behavior, or middleware.

---

## RSC Rules (IMPORTANT)

### Allowed

- route loaders
- route actions
- some resources

### NOT allowed

- app shell
- arbitrary components
- implicit fetch during render
- multiple result kinds from a single handler

---

## Design Constraints

### Must stay true

- Explicit server boundaries
- No hidden network calls
- Client-first rendering
- Minimal API surface

---

## Future Extensions (NOT v1)

- Devtools
- Advanced caching
- Offline queueing
- Streaming partial updates
- Layout routes / nested route trees
- Middleware

---

## Summary

Litz is:

- A Vite plugin
- A client-first React framework
- With server-side capabilities
- Using RSC as a fragment transport
- With clear, explicit boundaries

### Final Principle

> RSC is opt-in, explicit, and isolated. It enhances the app—it does not define it.
