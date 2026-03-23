# Volt

Volt is a client-first React framework for Vite.

It gives you:

- client-side navigation by default
- explicit server boundaries with `server(...)`
- route loaders and actions
- reusable server-backed resources
- raw API routes
- `view(...)` responses powered by React Server Components / Flight

## Status

Volt is currently a production candidate.

The core route, resource, API route, and RSC runtime now has deterministic route matching,
multipart-safe internal actions, and a release gate via `bun run check`.

## Installation

Inside a React + Vite app:

```bash
bun add volt react react-dom
```

## Quick Start

Add the Volt Vite plugin. By default, Volt discovers:

- routes from `src/routes/**/*.{ts,tsx}`
- API routes from `src/routes/api/**/*.{ts,tsx}`
- resources from `src/routes/resources/**/*.{ts,tsx}`

`vite.config.ts`

```ts
import { defineConfig } from "vite";
import volt from "volt/vite";

export default defineConfig({
  plugins: [volt()],
});
```

You can still override discovery explicitly when you need a different project layout:

```ts
export default defineConfig({
  plugins: [
    volt({
      routes: ["app/pages/**/*.{ts,tsx}"],
      resources: ["app/resources/**/*.{ts,tsx}"],
      api: ["app/api/**/*.{ts,tsx}"],
    }),
  ],
});
```

Mount the Volt app from your browser entry.

`src/main.tsx`

```tsx
import { mountApp } from "volt/client";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Missing "#app" root element.');
}

mountApp(root);
```

You can optionally provide a wrapper component around the app root:

```tsx
import { StrictMode } from "react";
import { mountApp } from "volt/client";

mountApp(root, StrictMode);
```

For providers or wrappers with props, pass a component:

```tsx
import { mountApp } from "volt/client";

function AppProviders({ children }: React.PropsWithChildren) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

mountApp(root, AppProviders);
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
import { defineRoute } from "volt";

export const route = defineRoute("/", {
  component: HomePage,
});

function HomePage() {
  return (
    <main>
      <h1>Welcome</h1>
      <p>Your app is running on Volt.</p>
    </main>
  );
}
```

## Routes

Routes are explicit. The path you pass to `defineRoute(...)` is the source of truth.

Add a loader when you need server data:

```tsx
import { data, defineRoute, server } from "volt";

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

- `pendingComponent` for the first unresolved loader pass
- `errorComponent` for `error(...)` results and unhandled route faults
- `middleware` for per-definition request handling

## Layouts

Layouts are explicit too. A route opts into a layout by importing it and passing `layout`.

```tsx
import type { ReactNode } from "react";
import { defineLayout, defineRoute } from "volt";

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
- `layout.useData()`
- `layout.useView()`
- `layout.useParams()`
- `layout.useSearch()`
- `layout.useStatus()`
- `layout.usePending()`
- `layout.useReload()`
- `layout.useRetry()`

## `view(...)`

When you want the server to return UI instead of JSON, return `view(...)`.

```tsx
import * as React from "react";
import { defineRoute, server, view } from "volt";

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
- `useLoaderData()` / `useLoaderView()` and `useActionData()` / `useActionView()` / `useActionError()` expose branch-specific values
- `useData()` / `useView()` / `useError()` expose the latest settled value from either the loader or action
- unresolved values are `null`

## Route State Hooks

Routes expose state and control hooks beyond the result helpers:

```tsx
function SaveToolbar() {
  const status = route.useStatus();
  const pending = route.usePending();
  const reload = route.useReload();
  const retry = route.useRetry();
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
      <button onClick={() => retry()} disabled={pending}>
        Retry
      </button>
      <button onClick={() => submit({ name: "Ada" })} disabled={pending}>
        Save
      </button>
    </div>
  );
}
```

`useStatus()` returns one of:

- `idle`
- `loading`
- `submitting`
- `revalidating`
- `offline-stale`
- `error`

Use the more specific hooks when you know which source you want:

- `useLoaderData()` if you only care about loader `data(...)`
- `useActionError()` if you only care about explicit action `error(...)`
- `useView()` if you want the latest settled `view(...)` from either side

## Actions

Actions handle writes. They can return `data(...)`, `invalid(...)`, `redirect(...)`,
`error(...)`, or `view(...)`.

```tsx
import { useFormStatus } from "react-dom";
import { data, defineRoute, invalid, server } from "volt";

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

Volt ships a small client navigation layer.

```tsx
import { Link, useNavigate } from "volt/client";

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
import { useMatches } from "volt";

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
import { useLocation, usePathname } from "volt";

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

Resources are reusable server-backed capabilities that are not navigable routes.

```tsx
import { data, defineResource, server } from "volt";

export const resource = defineResource("/resource/user/:id", {
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
  const result = resource.useLoader({
    params: { id: "u_123" },
  });

  if (result.kind !== "data") {
    return <p>Loading...</p>;
  }

  return <p>{result.data.user.name}</p>;
}
```

Resources can also expose an optional packaged component:

```tsx
<resource.Component params={{ id: "u_123" }} />
```

Resources can also define actions for imperative writes:

```tsx
import * as React from "react";
import { defineResource, server, view } from "volt";

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

function FeedPanel(props: React.ComponentProps<typeof resource.Component>) {
  const loader = resource.useLoader(props);
  const action = resource.useAction(props);
  const [message, setMessage] = React.useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void action.submit({ message }, props);
      }}
    >
      <input value={message} onChange={(event) => setMessage(event.target.value)} />
      <button type="submit">Send</button>
      <React.Suspense fallback={<p>Loading...</p>}>{loader.render()}</React.Suspense>
    </form>
  );
}
```

Resource loaders expose:

- `kind` as `undefined`, `data`, or `view`
- `load(...)` to refetch imperatively
- `render()` to render the current `view(...)` branch when present

Resource actions are imperative. They expose `submit(...)`, not action-result hooks.

## API Routes

API routes expose raw HTTP handlers and come with a thin client helper.

```ts
import { defineApiRoute } from "volt";

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

## Server Runtime

Volt ships a default WinterCG-style server runtime:

```ts
import { createServer } from "volt/server";

export default createServer({
  createContext(request) {
    return {
      requestId: request.headers.get("x-request-id"),
    };
  },
  onError(error, context) {
    console.error("Volt server error", { error, context });
  },
});
```

In simple apps, `createServer()` with no arguments is enough:

```ts
import { createServer } from "volt/server";

export default createServer();
```

The Vite plugin injects the discovered server manifest automatically into that entry.

## Result Helpers

Server handlers can return these helpers:

- `data(value, options?)`
- `view(node, options?)`
- `invalid({ ... })`
- `redirect(location, options?)`
- `error(status, message, options?)`
- `withHeaders(result, headers)`

```tsx
import { data, defineRoute, error, redirect, server, withHeaders } from "volt";

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
- `invalid(...)` populates `useInvalid()`
- `redirect(...)` navigates instead of producing hook state
- explicit action `error(...)` is available through `useActionError()` and `useError()`
- route faults and loader failures go through route error boundaries

## Middleware

Routes, resources, and API routes can declare a `middleware` array. Middleware runs in order and can continue with `next()`, short-circuit with a result, or explicitly replace `context` with `next({ context })`.

```tsx
import { data, defineApiRoute, defineRoute, error, server } from "volt";

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

- Volt is SPA-first. The browser owns the document.
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
