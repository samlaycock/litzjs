import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

export const route = defineRoute("/docs/api-reference", {
  component: ApiReference,
});

function ApiReference() {
  return (
    <>
      <title>API Reference | Litz</title>

      <h1 className="text-3xl font-bold text-neutral-50 mb-4">API Reference</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Complete reference for all exports from litzjs, litzjs/client, litzjs/server, and
        litzjs/vite.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">litzjs</h2>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">defineRoute</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">defineRoute(path, options)</code> — Define a route.
          Options:{" "}
          <code className="text-sky-400">
            {"{ component, loader?, action?, layout?, middleware?, errorBoundary?, offline? }"}
          </code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">defineLayout</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">defineLayout(path, options)</code> — Define a layout.
          Options:{" "}
          <code className="text-sky-400">
            {"{ component, loader?, layout?, middleware?, errorBoundary? }"}
          </code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">defineResource</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">defineResource(path, options)</code> — Define a resource.
          Options:{" "}
          <code className="text-sky-400">{"{ component, loader?, action?, middleware? }"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">defineApiRoute</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">defineApiRoute(path, definition)</code> — Define an API
          route. Definition:{" "}
          <code className="text-sky-400">
            {"{ GET?, POST?, PUT?, PATCH?, DELETE?, OPTIONS?, HEAD?, ALL?, middleware? }"}
          </code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">server</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">server(handler)</code> — Marker for server-only handlers.
          Returns the handler. Used in loader/action options.
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">data</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">data(value, options?)</code> — Return JSON data. Options:{" "}
          <code className="text-sky-400">{"{ headers?, status?, revalidate? }"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">view</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">view(node, options?)</code> — Return RSC fragment. Options:{" "}
          <code className="text-sky-400">{"{ headers?, revalidate? }"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">invalid</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">invalid(options?)</code> — Return validation error.
          Options:{" "}
          <code className="text-sky-400">
            {"{ headers?, status?, fields?, formError?, data? }"}
          </code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">redirect</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">redirect(location, options?)</code> — Return redirect.
          Options:{" "}
          <code className="text-sky-400">{"{ headers?, status?, replace?, revalidate? }"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">error</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">error(status, message, options?)</code> — Return error.
          Options: <code className="text-sky-400">{"{ headers?, code?, data? }"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">withHeaders</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">withHeaders(result, headers)</code> — Merge headers onto
          any ServerResult or Response.
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">useMatches</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">useMatches()</code> — Returns array of current matched
          routes: <code className="text-sky-400">{"{ id, path, params, search }[]"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">useLocation</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">useLocation()</code> — Returns{" "}
          <code className="text-sky-400">{"{ href, pathname, search, hash }"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">usePathname</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">usePathname()</code> — Returns current pathname string.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">litzjs/client</h2>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">mountApp</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">mountApp(element, options?)</code> — Mount the Litz app to
          a DOM element. Options:{" "}
          <code className="text-sky-400">{"{ component?, layout?, notFound? }"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">Link</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">{'<Link href="..." />'}</code> — Client-side navigation
          link. Standard anchor props. Intercepts same-origin clicks.
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">useNavigate</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">useNavigate()</code> — Returns{" "}
          <code className="text-sky-400">{"(href, options?) => void"}</code>. Options:{" "}
          <code className="text-sky-400">{"{ replace? }"}</code>
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">litzjs/server</h2>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">createServer</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">createServer(options?)</code> — Create WinterCG request
          handler. Options:{" "}
          <code className="text-sky-400">
            {"{ createContext?, onError?, document?, notFound?, assets? }"}
          </code>
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">litzjs/vite</h2>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">litz (plugin)</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">litz(options?)</code> — Vite plugin. Options:{" "}
          <code className="text-sky-400">{"{ routes?, api?, resources?, server? }"}</code>
        </p>
        <p className="text-neutral-400 mb-4">Default discovery paths:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">routes</code> —{" "}
            <code className="text-sky-400">{"src/routes/**/*.{ts,tsx}"}</code>
          </li>
          <li>
            <code className="text-sky-400">api</code> —{" "}
            <code className="text-sky-400">{"src/routes/api/**/*.{ts,tsx}"}</code>
          </li>
          <li>
            <code className="text-sky-400">resources</code> —{" "}
            <code className="text-sky-400">{"src/routes/resources/**/*.{ts,tsx}"}</code>
          </li>
          <li>
            <code className="text-sky-400">server</code> —{" "}
            <code className="text-sky-400">src/server.ts</code> or{" "}
            <code className="text-sky-400">src/server/index.ts</code>
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Route hooks</h2>
        <p className="text-neutral-400 mb-4">
          Available on route objects returned by <code className="text-sky-400">defineRoute</code>:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">route.useParams()</code> — Path parameters
          </li>
          <li>
            <code className="text-sky-400">route.useSearch()</code> —{" "}
            <code className="text-sky-400">[URLSearchParams, setSearch]</code>
          </li>
          <li>
            <code className="text-sky-400">route.useStatus()</code> —{" "}
            <code className="text-sky-400">RouteStatus</code>:{" "}
            <code className="text-sky-400">
              'idle' | 'loading' | 'submitting' | 'revalidating' | 'offline-stale' | 'error'
            </code>
          </li>
          <li>
            <code className="text-sky-400">route.usePending()</code> — boolean
          </li>
          <li>
            <code className="text-sky-400">route.useLoaderResult()</code> — Normalized loader result
            or null
          </li>
          <li>
            <code className="text-sky-400">route.useLoaderData()</code> — Loader data or null
          </li>
          <li>
            <code className="text-sky-400">route.useLoaderView()</code> — Loader view node or null
          </li>
          <li>
            <code className="text-sky-400">route.useLoaderError()</code> — Explicit loader error or
            null
          </li>
          <li>
            <code className="text-sky-400">route.useActionResult()</code> — Normalized action result
            or null
          </li>
          <li>
            <code className="text-sky-400">route.useActionData()</code> — Action data or null
          </li>
          <li>
            <code className="text-sky-400">route.useActionView()</code> — Action view node or null
          </li>
          <li>
            <code className="text-sky-400">route.useActionError()</code> — Explicit action error or
            null
          </li>
          <li>
            <code className="text-sky-400">route.useInvalid()</code> — Invalid result (fields,
            formError) or null
          </li>
          <li>
            <code className="text-sky-400">route.useData()</code> — Latest settled data from loader
            or action
          </li>
          <li>
            <code className="text-sky-400">route.useView()</code> — Latest settled view from loader
            or action
          </li>
          <li>
            <code className="text-sky-400">route.useError()</code> — Latest settled merged explicit
            error
          </li>
          <li>
            <code className="text-sky-400">route.useReload()</code> — Reload loader
          </li>
          <li>
            <code className="text-sky-400">route.useSubmit(options?)</code> — Submit to action
          </li>
          <li>
            <code className="text-sky-400">route.Form</code> — Form component bound to route action
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Layout hooks</h2>
        <p className="text-neutral-400 mb-4">
          Same as route hooks minus action-related hooks (
          <code className="text-sky-400">useActionResult</code>,{" "}
          <code className="text-sky-400">useActionData</code>,{" "}
          <code className="text-sky-400">useActionView</code>,{" "}
          <code className="text-sky-400">useActionError</code>,{" "}
          <code className="text-sky-400">useSubmit</code>,{" "}
          <code className="text-sky-400">Form</code>,{" "}
          <code className="text-sky-400">useInvalid</code>).
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Resource hooks</h2>
        <p className="text-neutral-400 mb-4">
          Same as route hooks. All available inside{" "}
          <code className="text-sky-400">resource.Component</code> subtree. Plus{" "}
          <code className="text-sky-400">resource.Component</code> for rendering.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Types</h2>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">RouteStatus</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">
            'idle' | 'loading' | 'submitting' | 'revalidating' | 'offline-stale' | 'error'
          </code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">RouteErrorLike</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">{"RouteExplicitErrorLike | RouteFaultLike"}</code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">SubmitOptions</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">
            {"{ onBeforeSubmit?, onSuccess?, onError?, replace?, revalidate? }"}
          </code>
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">Handler context</h3>
        <p className="text-neutral-400 mb-4">
          <code className="text-sky-400">
            {"{ request: Request, params, signal: AbortSignal, context }"}
          </code>
        </p>
      </section>

      <div className="flex justify-start pt-8 border-t border-neutral-800">
        <Link
          href="/docs/cloudflare-workers"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Cloudflare Workers
        </Link>
      </div>
    </>
  );
}
