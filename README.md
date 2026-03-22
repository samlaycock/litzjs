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

Add the Volt Vite plugin and tell it where to discover your modules.

`vite.config.ts`

```ts
import { defineConfig } from "vite";
import volt from "volt/vite";

export default defineConfig({
  plugins: [
    volt({
      routes: ["src/routes/**/*.tsx"],
      resources: ["src/resources/**/*.tsx"],
      api: ["src/api/**/*.ts"],
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
  const result = route.useLoaderResult();

  if (result.kind !== "data") {
    return null;
  }

  return <p>{result.data.user.name}</p>;
}
```

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
  const result = route.useLoaderResult();

  return <React.Suspense fallback={<p>Loading reports...</p>}>{result.render()}</React.Suspense>;
}

function ReportsPanel() {
  return <section>Rendered on the server.</section>;
}
```

## Actions

Actions handle writes. They can return `data(...)`, `invalid(...)`, `redirect(...)`,
`error(...)`, or `view(...)`.

```tsx
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
  const action = route.useActionResult();

  return (
    <route.Form>
      <input name="name" />
      {action?.kind === "invalid" ? <p>{action.fields?.name}</p> : null}
      <button type="submit">Create</button>
    </route.Form>
  );
}
```

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

## Middleware

Routes, resources, and API routes can declare a `middleware` array. Middleware runs in order and can continue with `next()`, short-circuit with a result, or explicitly replace `context` with `next({ context })`.

The API shape is present now. The execution pipeline is still being wired up.

## Core Ideas

- Volt is SPA-first. The browser owns the document.
- Server logic only exists at explicit framework boundaries.
- `view(...)` uses RSC as a transport, not as the whole app architecture.
- Routes, resources, and API routes are discovered from configured globs.
- Paths are explicit and absolute.

## Try The Fixture

This repo includes a working fixture app in [`fixtures/rsc-smoke`](./fixtures/rsc-smoke):

```bash
bun run fixture:dev
```

Then open [http://127.0.0.1:4173/](http://127.0.0.1:4173/).

## What’s Next

This README is intentionally short. A dedicated docs site can cover:

- server runtime setup
- caching and revalidation
- resource patterns
- RSC guidance
- production deployment
- adapter support
