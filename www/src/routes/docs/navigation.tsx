import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/navigation", {
  component: DocsNavigationPage,
});

function DocsNavigationPage() {
  return (
    <>
      <title>Navigation | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Navigation</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Client-side routing with Link, imperative navigation, and location hooks.
      </p>
      <p className="text-neutral-400 mb-8">
        Litz uses client-side navigation by default. When a user clicks a{" "}
        <code className="text-sky-400">{"<Link>"}</code>, Litz intercepts the click, fetches the
        next route data over the wire, and swaps the UI without a full page reload.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Link component</h2>
        <p className="text-neutral-400 mb-4">
          Import <code className="text-sky-400">Link</code> from{" "}
          <code className="text-sky-400">"litz/client"</code>. It uses{" "}
          <code className="text-sky-400">href</code> (not <code className="text-sky-400">to</code>)
          to match the native anchor API.
        </p>
        <p className="text-neutral-400 mb-4">
          Only same-origin plain clicks are intercepted for client navigation. Modifier clicks
          (ctrl, meta), external links, and downloads fall back to the browser. Plain{" "}
          <code className="text-sky-400">{"<a href>"}</code> elements stay native and are never
          intercepted.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { Link } from "litz/client";

function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <Link href="/dashboard/settings">Settings</Link>
    </nav>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">useNavigate()</h2>
        <p className="text-neutral-400 mb-4">
          Import from <code className="text-sky-400">"litz/client"</code>. Returns a function with
          the signature{" "}
          <code className="text-sky-400">
            {"(href: string, options?: { replace?: boolean }) => void"}
          </code>
          . Use it for imperative navigation after a form submit, button click, or any programmatic
          event.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { useNavigate } from "litz/client";

function LogoutButton() {
  const navigate = useNavigate();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    navigate("/login", { replace: true });
  }

  return <button onClick={handleLogout}>Log out</button>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">useLocation()</h2>
        <p className="text-neutral-400 mb-4">
          Import from <code className="text-sky-400">"litz"</code>. Returns an object with{" "}
          <code className="text-sky-400">{"{ href, pathname, search, hash }"}</code>.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { useLocation } from "litz";

function LocationDebug() {
  const location = useLocation();

  return (
    <pre>
      {JSON.stringify(location, null, 2)}
    </pre>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">usePathname()</h2>
        <p className="text-neutral-400 mb-4">
          Import from <code className="text-sky-400">"litz"</code>. Returns the current pathname as
          a string. This is a convenience shortcut when you only need the path.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { usePathname } from "litz";

function NavLink(props: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === props.href;

  return (
    <a href={props.href} className={active ? "text-sky-400" : "text-neutral-400"}>
      {props.children}
    </a>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">useMatches()</h2>
        <p className="text-neutral-400 mb-4">
          Import from <code className="text-sky-400">"litz"</code>. Returns an array of matched
          route info objects: <code className="text-sky-400">{"{ id, path, params, search }"}</code>
          . This is useful for building breadcrumbs or conditional UI based on the current route
          hierarchy.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { useMatches } from "litz";
import { Link } from "litz/client";

function Breadcrumbs() {
  const matches = useMatches();

  return (
    <nav className="flex gap-2 text-sm text-neutral-400">
      {matches.map((match, i) => (
        <span key={match.id}>
          {i > 0 && <span className="mx-1">/</span>}
          <Link href={match.path}>{match.id}</Link>
        </span>
      ))}
    </nav>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Search params</h2>
        <p className="text-neutral-400 mb-4">
          Use <code className="text-sky-400">route.useSearch()</code> to read and write search
          params. It returns <code className="text-sky-400">{"[URLSearchParams, setSearch]"}</code>.
        </p>
        <p className="text-neutral-400 mb-4">
          The <code className="text-sky-400">setSearch</code> function merges by default: a string
          value sets the key, a <code className="text-sky-400">string[]</code> writes repeated keys,
          and <code className="text-sky-400">null</code> or{" "}
          <code className="text-sky-400">undefined</code> deletes the key. Pass{" "}
          <code className="text-sky-400">{"{ replace: true }"}</code> to replace the history entry
          instead of pushing.
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute } from "litz";

export const route = defineRoute("/products", {
  component: ProductsPage,
});

function ProductsPage() {
  const [search, setSearch] = route.useSearch();
  const category = search.get("category") ?? "all";
  const sort = search.get("sort") ?? "newest";

  return (
    <div>
      <div className="flex gap-4">
        <select
          value={category}
          onChange={(e) => setSearch({ category: e.target.value })}
        >
          <option value="all">All</option>
          <option value="shirts">Shirts</option>
          <option value="shoes">Shoes</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSearch({ sort: e.target.value })}
        >
          <option value="newest">Newest</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>

        <button onClick={() => setSearch({ category: null, sort: null })}>
          Clear filters
        </button>
      </div>
    </div>
  );
}`}
        />
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/layouts"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Layouts
        </Link>
        <Link
          href="/docs/loaders-and-actions"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Loaders &amp; Actions &rarr;
        </Link>
      </div>
    </>
  );
}
