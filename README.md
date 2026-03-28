# Litz

Litz is a client-first React framework for Vite.

It gives you:

- client-side navigation by default
- explicit server boundaries with `server(...)`
- route loaders and actions
- reusable server-backed resources
- raw API routes
- `view(...)` responses powered by React Server Components / Flight

## Status

Litz is currently a production candidate.

The core route, resource, API route, and RSC runtime now has deterministic route matching,
multipart-safe internal actions, and a release gate via `bun run check`.

## Installation

Inside a React + Vite app:

```bash
bun add litzjs react react-dom
```

## Quick Start

Add the Litz Vite plugin. By default, Litz discovers:

- routes from `src/routes/**/*.{ts,tsx}`
- API routes from `src/routes/api/**/*.{ts,tsx}`
- resources from `src/routes/resources/**/*.{ts,tsx}`
- a custom server entry from `src/server.ts`, falling back to `src/server/index.ts`

`vite.config.ts`

```ts
import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [litz()],
});
```

You can still override discovery explicitly when you need a different project layout:

```ts
export default defineConfig({
  plugins: [
    litz({
      routes: ["app/pages/**/*.{ts,tsx}"],
      resources: ["app/resources/**/*.{ts,tsx}"],
      api: ["app/api/**/*.{ts,tsx}"],
      server: "app/server/entry.ts",
    }),
  ],
});
```

Mount the Litz app from your browser entry.

`src/main.tsx`

```tsx
import { mountApp } from "litzjs/client";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Missing "#app" root element.');
}

mountApp(root);
```

You can optionally provide a wrapper component around the app root:

```tsx
import { StrictMode } from "react";
import { mountApp } from "litzjs/client";

mountApp(root, { component: StrictMode });
```

For providers or wrappers with props, pass your component through the same options object:

```tsx
import { mountApp } from "litzjs/client";

function AppProviders({ children }: React.PropsWithChildren) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

mountApp(root, { component: AppProviders });
```

You can also customize the unmatched client screen:

```tsx
import { mountApp, useLocation } from "litzjs/client";

function NotFoundPage() {
  const location = useLocation();
  return <h1>Missing: {location.pathname}</h1>;
}

mountApp(root, { notFound: NotFoundPage });
```

By default, client navigations scroll to the top on pushes, restore saved scroll positions on back and forward, and move focus to the first `main` landmark after page-changing navigations render. You can opt out of either behavior when your app needs to manage navigation UX itself:

```tsx
import { mountApp } from "litzjs/client";

mountApp(root, {
  scrollRestoration: false,
  focusManagement: false,
});
```

`index.html`

```html
<!doctype html>
<html lang="en">
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create your first route.

`src/routes/index.tsx`

```tsx
import { defineRoute } from "litzjs";

export const route = defineRoute("/", {
  component: HomePage,
});

function HomePage() {
  return (
    <main>
      <h1>Welcome</h1>
      <p>Your app is running on Litz.</p>
    </main>
  );
}
```

## Routes

Routes are explicit. The path you pass to `defineRoute(...)` is the source of truth.

Add a loader when you need server data:

```tsx
import { data, defineRoute, server } from "litzjs";

export const route = defineRoute("/me", {
  component: ProfilePage,
  loader: server(async () => {
    return data({
      user: {
        id: "u_123",
        name: "Ada",
      },
    });
  }),
});

function ProfilePage() {
  const profile = route.useLoaderData();

  if (!profile) {
    return null;
  }

  return <p>{profile.user.name}</p>;
}
```

Routes and layouts can also define:

- `errorBoundary` for unhandled route faults
- `middleware` for per-definition request handling

## Layouts

Layouts are explicit too. A route opts into a layout by importing it and passing `layout`.

```tsx
import type { ReactNode } from "react";
import { defineLayout, defineRoute } from "litzjs";

export const dashboardLayout = defineLayout("/dashboard", {
  component: DashboardShell,
});

export const route = defineRoute("/dashboard/settings", {
  component: SettingsPage,
  layout: dashboardLayout,
});

function DashboardShell(props: { children: ReactNode }) {
  return (
    <div>
      <aside>Dashboard nav</aside>
      <section>{props.children}</section>
    </div>
  );
}

function SettingsPage() {
  return <h1>Settings</h1>;
}
```

Layouts can declare loaders and use the same route-state hooks:

- `layout.useLoaderResult()`
- `layout.useLoaderData()`
- `layout.useLoaderView()`
- `layout.useLoaderError()`
- `layout.useData()`
- `layout.useView()`
- `layout.useParams()`
- `layout.useSearch()`
- `layout.useStatus()`
- `layout.usePending()`
- `layout.useReload()`

## `view(...)`

When you want the server to return UI instead of JSON, return `view(...)`.

```tsx
import * as React from "react";
import { defineRoute, server, view } from "litzjs";

export const route = defineRoute("/reports", {
  component: ReportsPage,
  loader: server(async () => {
    return view(<ReportsPanel />);
  }),
});

function ReportsPage() {
  const view = route.useLoaderView();

  if (!view) {
    return <p>Loading reports...</p>;
  }

  return <React.Suspense fallback={<p>Loading reports...</p>}>{view}</React.Suspense>;
}

function ReportsPanel() {
  return <section>Rendered on the server.</section>;
}
```

Result hooks are layered:

- `useLoaderResult()` and `useActionResult()` expose the raw normalized result branches
- `useLoaderData()` / `useLoaderView()` / `useLoaderError()` and `useActionData()` / `useActionView()` / `useActionError()` expose branch-specific values
- `useData()` / `useView()` / `useError()` expose the latest settled merged value
- unresolved values are `null`

## Route State Hooks

Routes expose state and control hooks beyond the result helpers:

```tsx
function SaveToolbar() {
  const status = route.useStatus();
  const pending = route.usePending();
  const reload = route.useReload();
  const submit = route.useSubmit({
    onSuccess(result) {
      console.log("saved", result.kind);
    },
  });

  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={() => reload()} disabled={pending}>
        Reload
      </button>
      <button onClick={() => submit({ name: "Ada" })} disabled={pending}>
        Save
      </button>
    </div>
  );
}
```

Imperative submit payloads now use an explicit `FormData` contract. Primitive values and
`Blob`/`File` values append directly, arrays expand into repeated fields, and structured values
must be wrapped with `formJson(value)` so their JSON encoding is intentional.

`useStatus()` returns one of:

- `idle`
- `loading`
- `submitting`
- `revalidating`
- `offline-stale`
- `error`

`useStatus()` reflects the active route/layout chain as a whole. If a parent layout has an
explicit loader error, the route status can be `"error"` even when `route.useError()` is `null`;
use the scoped error hooks when you need the exact source.

Use the more specific hooks when you know which source you want:

- `useLoaderData()` if you only care about loader `data(...)`
- `useLoaderError()` if you only care about loader `error(...)`
- `useActionError()` if you only care about explicit action `error(...)`
- `useView()` if you want the latest settled `view(...)` from either side

Loader-only hooks keep the last loader result until you call `useReload()`. A later successful
action can clear merged `useError()` and return `useStatus()` to `idle` while
`useLoaderError()` still reflects the earlier loader error.

## Actions

Actions handle writes. They can return `data(...)`, `invalid(...)`, `redirect(...)`,
`error(...)`, or `view(...)`.

```tsx
import { useFormStatus } from "react-dom";
import { data, defineRoute, invalid, server } from "litzjs";

export const route = defineRoute("/projects/new", {
  component: NewProjectPage,
  action: server(async ({ request }) => {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();

    if (!name) {
      return invalid({
        fields: { name: "Name is required" },
      });
    }

    return data({ ok: true, name });
  }),
});

function NewProjectPage() {
  const invalidResult = route.useInvalid();
  const created = route.useActionData();

  return (
    <route.Form>
      <input name="name" />
      {invalidResult ? <p>{invalidResult.fields?.name}</p> : null}
      {created ? <p>Created {created.name}</p> : null}
      <SubmitButton />
    </route.Form>
  );
}

function SubmitButton() {
  const status = useFormStatus();

  return (
    <button type="submit" disabled={status.pending}>
      {status.pending ? "Creating..." : "Create"}
    </button>
  );
}
```

`route.Form` uses React 19 form actions under the hood, so nested components can use
`useFormStatus()` without extra framework wrappers.

If you need imperative writes instead of a form, use `route.useSubmit()`.

## Navigation

Litz ships a small client navigation layer.

```tsx
import { Link, useNavigate } from "litzjs/client";

function Nav() {
  const navigate = useNavigate();

  return (
    <>
      <Link href="/reports">Reports</Link>
      <button onClick={() => navigate("/me")}>Go to profile</button>
    </>
  );
}
```

`Link` keeps normal anchor ergonomics:

- it uses `href`, not `to`
- only `Link` intercepts same-origin plain clicks for client navigation
- modifier clicks, external links, and downloads fall back to the browser

Plain `<a href>` elements stay native and perform normal browser navigations.

You can also inspect the active route chain:

```tsx
import { useMatches } from "litzjs";

function Breadcrumbs() {
  const matches = useMatches();

  return (
    <ol>
      {matches.map((match) => (
        <li key={match.id}>{match.path}</li>
      ))}
    </ol>
  );
}
```

If you want the current concrete browser location instead of the route pattern chain:

```tsx
import { useLocation, usePathname } from "litzjs";

function RouteMeta() {
  const pathname = usePathname();
  const location = useLocation();

  return (
    <>
      <p>Pathname: {pathname}</p>
      <p>Hash: {location.hash || "(none)"}</p>
    </>
  );
}
```

`useLocation()` returns:

- `href`
- `pathname`
- `search`
- `hash`

## Search Params

Search params are part of the route runtime:

```tsx
function ReportsFilters() {
  const [searchParams, setSearch] = route.useSearch();
  const tab = searchParams.get("tab") ?? "all";

  return (
    <>
      <p>Current tab: {tab}</p>
      <button onClick={() => setSearch({ tab: "open", tag: ["bug", "urgent"] })}>
        Show open bugs
      </button>
      <button onClick={() => setSearch({ tag: null }, { replace: true })}>Clear tags</button>
    </>
  );
}
```

`setSearch(...)` merges by default:

- `string` sets a single value
- `string[]` writes repeated keys
- `null` or `undefined` deletes a key
- unchanged updates are ignored
- updates go through the normal client navigation and revalidation path

Layouts expose the same `[searchParams, setSearch]` tuple.

## Resources

Resources are route-agnostic ways to package client-side and server-side functionality into a
self-contained component or unit of code.

They are for cases where something should be reusable across routes, layouts, and app shells
without becoming a page of its own. A resource can own:

- its own server loader
- its own server action
- its own pending and error state
- its own params and search input
- its own client UI

The mental model is:

- routes own navigation
- resources own reusable server-backed UI behavior

Each rendered `<resource.Component ... />` creates a scoped resource instance. Inside that subtree,
resource hooks work like route hooks, but against that resource instance.

### Loader-Only Resource

A resource always declares a `component`. That component reads resource state through hooks.

```tsx
import { data, defineResource, server } from "litzjs";

export const resource = defineResource("/resource/user/:id", {
  component: UserCard,
  loader: server(async ({ params }) => {
    return data({
      user: {
        id: params.id,
        name: "Ada",
      },
    });
  }),
});

function UserCard() {
  const user = resource.useLoaderData();
  const pending = resource.usePending();

  if (!user) {
    return <p>{pending ? "Loading..." : "No user"}</p>;
  }

  return <p>{user.user.name}</p>;
}
```

Render it anywhere:

```tsx
<resource.Component params={{ id: "u_123" }} />
```

### Search Params And Params

Resources receive `params` and optional `search` at the component boundary:

```tsx
<resource.Component params={{ id: "u_123" }} search={{ tab: "profile" }} />
```

Inside the resource, use the scoped hooks:

```tsx
function UserCard() {
  const params = resource.useParams();
  const [searchParams, setSearch] = resource.useSearch();
  const tab = searchParams.get("tab") ?? "profile";

  return (
    <>
      <p>User id: {params.id}</p>
      <p>Tab: {tab}</p>
      <button onClick={() => setSearch({ tab: "security" })}>Security</button>
    </>
  );
}
```

Unlike route-scoped search state, `resource.useSearch()` only updates the resource request.
It does not push or replace browser history entries.

### View-Based Resource

Resources can also return `view(...)` from the server and consume it with `resource.useView()`:

```tsx
import * as React from "react";
import { defineResource, server, view } from "litzjs";

export const resource = defineResource("/resource/account/:id", {
  component: AccountMenu,
  loader: server(async ({ params }) => {
    return view(<section>Account {params.id}</section>);
  }),
});

function AccountMenu() {
  const view = resource.useView();

  if (!view) {
    return <p>Loading account menu...</p>;
  }

  return <React.Suspense fallback={<p>Loading account menu...</p>}>{view}</React.Suspense>;
}
```

### Action-Enabled Resource

Resources can define actions with the same self-contained form story as routes:

```tsx
import * as React from "react";
import { defineResource, server, view } from "litzjs";
import { useFormStatus } from "react-dom";

export const resource = defineResource("/resource/feed/:id", {
  component: FeedPanel,
  loader: server(async ({ params }) => {
    return view(
      <ul>
        <li>Feed {params.id}</li>
      </ul>,
    );
  }),
  action: server(async ({ params, request }) => {
    const formData = await request.formData();
    const message = String(formData.get("message") ?? "");

    return view(
      <ul>
        <li>{params.id}</li>
        <li>{message}</li>
      </ul>,
    );
  }),
});

function FeedPanel() {
  const view = resource.useView();
  const pending = resource.usePending();
  const [message, setMessage] = React.useState("");

  return (
    <resource.Form
      onSubmit={(event) => {
        if (!message.trim()) {
          event.preventDefault();
          return;
        }

        setMessage("");
      }}
    >
      <input
        name="message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        disabled={pending}
      />
      <SubmitButton />
      {view ? <React.Suspense fallback={<p>Loading...</p>}>{view}</React.Suspense> : null}
    </resource.Form>
  );
}

function SubmitButton() {
  const status = useFormStatus();

  return (
    <button type="submit" disabled={status.pending}>
      {status.pending ? "Sending..." : "Send"}
    </button>
  );
}
```

You can also submit imperatively:

```tsx
function QuickActions() {
  const submit = resource.useSubmit();
  const pending = resource.usePending();

  return (
    <button disabled={pending} onClick={() => void submit({ message: "Pinned update" })}>
      Post preset message
    </button>
  );
}
```

Use `formJson(value)` here as well when a field should be JSON-encoded instead of appended as a
plain scalar.

### Available Resource Hooks

Inside a resource component subtree, resources expose the same style of hooks as routes:

- `resource.useLoaderResult()`
- `resource.useLoaderData()`
- `resource.useLoaderView()`
- `resource.useLoaderError()`
- `resource.useActionResult()`
- `resource.useActionData()`
- `resource.useActionView()`
- `resource.useActionError()`
- `resource.useInvalid()`
- `resource.useData()`
- `resource.useView()`
- `resource.useError()`
- `resource.useStatus()`
- `resource.usePending()`
- `resource.useParams()`
- `resource.useSearch()`
- `resource.useReload()`
- `resource.useSubmit()`
- `resource.Form`

The main split to keep in mind:

- `useLoaderData()` / `useLoaderView()` / `useLoaderError()` read loader-only state
- `useActionData()` / `useActionView()` / `useActionError()` / `useInvalid()` read action-only state
- `useData()` / `useView()` / `useError()` read the latest settled merged value for the resource
- `useSearch()` updates the resource request only and never mutates browser history

Loader-only hooks keep the last loader result until you call `useReload()`. A later successful
action can clear merged `useError()` and return `useStatus()` to `idle` while
`useLoaderError()` still reflects the earlier loader error.

### Multiple Resource Instances

Resources are instance-scoped, not global. You can render the same resource multiple times on the
same page with different inputs:

```tsx
<>
  <userCard.Component params={{ id: "u_123" }} />
  <userCard.Component params={{ id: "u_456" }} />
</>
```

Each instance resolves against its own `params` and `search`. If two instances render with the
same resource path and the same request identity, they share the keyed runtime state under the hood,
so they stay in sync instead of duplicating work.

## API Routes

API routes expose raw HTTP handlers and come with a thin client helper.

```ts
import { defineApiRoute } from "litzjs";

export const api = defineApiRoute("/api/health", {
  middleware: [],
  GET() {
    return Response.json({ ok: true });
  },
  ALL({ request }) {
    return Response.json({ method: request.method });
  },
});
```

```ts
const response = await api.fetch();
const data = await response.json();
```

Supported method keys:

- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `OPTIONS`
- `HEAD`
- `ALL`

`ALL` acts as a fallback when there is no method-specific handler.

`api.fetch(...)` accepts route params, search params, headers, and the HTTP method when needed.

## Input Validation

Routes, layouts, resources, and API routes can declare an `input` object that parses raw request
surfaces into validated values before the handler runs.

```tsx
import { data, defineApiRoute, defineRoute, error, invalid, server } from "litzjs";

export const route = defineRoute("/projects/:id", {
  component: ProjectPage,
  input: {
    params(params) {
      const projectId = Number(params.id);

      if (!Number.isInteger(projectId)) {
        throw error(400, "Project id must be an integer.");
      }

      return { projectId };
    },
    search(search) {
      return {
        tab: search.get("tab") ?? "overview",
      };
    },
    headers(headers) {
      return {
        tenant: headers.get("x-tenant") ?? "public",
      };
    },
    async body(request) {
      const formData = await request.formData();
      const name = String(formData.get("name") ?? "").trim();

      if (!name) {
        throw invalid({
          fields: {
            name: "Name is required.",
          },
        });
      }

      return { name };
    },
  },
  loader: server(async ({ input }) => {
    return data({
      projectId: input.params.projectId,
      tab: input.search.tab,
      tenant: input.headers.tenant,
    });
  }),
  action: server(async ({ input }) => {
    return data({
      saved: true,
      name: input.body?.name ?? "",
    });
  }),
});

export const api = defineApiRoute("/api/projects/:id", {
  input: {
    params(params) {
      return {
        projectId: Number(params.id),
      };
    },
    async body(request) {
      return (await request.json()) as {
        name: string;
      };
    },
  },
  POST({ input }) {
    return Response.json({
      id: input.params.projectId,
      name: input.body?.name ?? null,
    });
  },
});
```

Each parser receives the raw value plus `{ request, params, signal, context }`.

- `params` receives the path params object
- `search` receives `URLSearchParams`
- `headers` receives `Headers`
- `body` receives a cloned `Request`, and `context.request` inside the body parser points at that same clone so handlers can still read the original request body safely

Parsed values are exposed on `context.input`. When no parser is defined, the raw request values are
still available through `request`, `params`, and the standard Web APIs.

Parsers can short-circuit by throwing Litz result helpers such as `error(...)` or `invalid(...)`.
For `GET` and `HEAD` requests, `input.body` is always `undefined`.

## Server Runtime

Litz ships a default WinterCG-style server runtime:

```ts
import { createServer } from "litzjs/server";

export default createServer({
  createContext(request) {
    return {
      requestId: request.headers.get("x-request-id"),
    };
  },
  notFound: "<!doctype html><html><body><h1>Not found</h1></body></html>",
  onError(error, context) {
    console.error("Litz server error", { error, context });
  },
});
```

In simple apps, `createServer()` with no arguments is enough:

```ts
import { createServer } from "litzjs/server";

export default createServer();
```

The Vite plugin injects the discovered server manifest automatically into that entry.

### Production Output

When you run `vite build`, Litz always writes the browser assets to `dist/client`.

Server output is always `dist/server/index.js`. The Vite plugin injects the discovered server
manifest into `createServer(...)` automatically.

By default, your host server or platform is responsible for serving `dist/client` (for example
through `express.static`, a CDN, or a platform asset binding).

If you want a self-contained single-file deployment, enable `embedAssets`:

```ts
litz({ embedAssets: true });
```

This inlines the built document HTML and all client asset contents into the server bundle, so the
server handler can serve `/` and `/assets/*` by itself without a separate static file server.

You can let Litz discover `src/server.ts` or `src/server/index.ts`, or configure a different path
explicitly in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [
    litz({
      server: "app/server/entry.ts",
    }),
  ],
});
```

In the custom-server case, unmatched document and static asset requests fall through to the normal
`createServer(...)` 404 behavior unless your host server handles them first.

## Security Model

Litz's server boundaries are explicit, but they are still normal server request surfaces.

- Route loaders and actions are server handlers.
- Resource loaders and actions are server handlers.
- API routes are raw HTTP handlers.
- The `/_litzjs/*` transport used by the client runtime is an implementation detail, not a private trust boundary.

That means Litz apps should treat route loaders, actions, resources, and API routes like any other
server endpoint:

- authenticate and authorize inside middleware or handlers
- validate params, search params, headers, and form/body input with `input` hooks or in middleware/handlers
- apply CSRF protections when using cookie-backed auth for writes
- do not assume a request came from Litz just because it arrived through `/_litzjs/*`

Litz may serve `index.html` itself, but it also supports deployments where the document is served
statically or by a custom server. Security decisions must not depend on the document coming from
Litz.

## Result Helpers

Server handlers can return these helpers:

- `data(value, options?)`
- `view(node, options?)`
- `invalid({ ... })`
- `redirect(location, options?)`
- `error(status, message, options?)`
- `withHeaders(result, headers)`

```tsx
import { data, defineRoute, error, redirect, server, withHeaders } from "litzjs";

export const route = defineRoute("/projects/:id", {
  component: ProjectPage,
  loader: server(async ({ params }) => {
    if (params.id === "new") {
      return redirect("/projects/create");
    }

    return withHeaders(data({ id: params.id }, { revalidate: ["/projects/:id"] }), {
      "cache-control": "private, max-age=60",
    });
  }),
  action: server(async ({ request }) => {
    const formData = await request.formData();

    if (!formData.get("name")) {
      return error(422, "Missing project name", {
        code: "missing_name",
        data: { field: "name" },
      });
    }

    return data({ ok: true });
  }),
});
```

Behavior summary:

- `data(...)` populates loader/action data hooks
- `view(...)` populates loader/action view hooks
- `error(...)` populates loader/action error hooks
- `fault(...)` populates route fault boundaries
- `invalid(...)` populates `useInvalid()`
- `redirect(...)` navigates instead of producing hook state
- explicit loader `error(...)` is available through `useLoaderError()` and `useError()`
- explicit action `error(...)` is available through `useActionError()` and `useError()`
- route faults go through route error boundaries

## Middleware

Routes, resources, and API routes can declare a `middleware` array. Middleware runs in order and can continue with `next()`, short-circuit with a result, or explicitly replace `context` with `next({ context })`.

```tsx
import { data, defineApiRoute, defineRoute, error, server } from "litzjs";

export const route = defineRoute("/dashboard", {
  component: DashboardPage,
  middleware: [
    async ({ context, next }) => {
      if (!context.userId) {
        return error(401, "Unauthorized");
      }

      return next();
    },
  ],
  loader: server(async ({ context }) => {
    return data({ userId: context.userId });
  }),
});

export const api = defineApiRoute("/api/dashboard", {
  middleware: [
    async ({ context, next }) => {
      if (!context.userId) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      return next();
    },
  ],
  GET({ context }) {
    return Response.json({ userId: context.userId });
  },
});
```

Middleware receives:

- `request`
- `params`
- `context`
- `signal`
- `next(...)`

## Core Ideas

- Litz is SPA-first. The browser owns the document.
- Server logic only exists at explicit framework boundaries.
- `view(...)` uses RSC as a transport, not as the whole app architecture.
- Routes, resources, and API routes are discovered from top-level glob options.
- Paths are explicit and absolute.

## Try The Fixture

This repo includes a working fixture app in [`fixtures/rsc-smoke`](./fixtures/rsc-smoke):

```bash
bun run fixture:dev
```

Then open [http://127.0.0.1:4173/](http://127.0.0.1:4173/).
