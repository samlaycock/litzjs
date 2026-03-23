import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs", {
  component: DocsIntroductionPage,
});

function DocsIntroductionPage() {
  return (
    <>
      <title>Introduction | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Introduction</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Litz is a client-first React framework for Vite.
      </p>
      <p className="text-neutral-400 mb-4">
        It is designed around a simple idea: the browser owns the document by default, and server
        work only exists at explicit framework boundaries.
      </p>
      <p className="text-neutral-400 mb-8">
        That gives you a model that feels close to a normal Vite app, while still providing
        framework features such as routes, layouts, loaders, actions, reusable resources, API
        routes, and <code className="text-sky-400">view(...)</code> responses powered by React
        Server Components / Flight.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">What Litz gives you</h2>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>Client-side navigation by default.</li>
          <li>
            Explicit server boundaries through <code className="text-sky-400">server(...)</code>.
          </li>
          <li>Route loaders and actions.</li>
          <li>Reusable server-backed resources.</li>
          <li>Raw API routes.</li>
          <li>
            <code className="text-sky-400">view(...)</code> responses for server-rendered UI
            fragments.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Core ideas</h2>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">SPA-first</h3>
        <p className="text-neutral-400 mb-4">Litz is not SSR-first.</p>
        <p className="text-neutral-400 mb-8">
          The browser owns the document, and the default mental model is still a client-rendered app
          with client-side navigation.
        </p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">Explicit server boundaries</h3>
        <p className="text-neutral-400 mb-4">Server logic is visible in the code.</p>
        <p className="text-neutral-400 mb-4">
          Instead of inferring server behavior from hidden conventions, Litz makes you opt into it
          explicitly:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-8">
          <li>route loaders</li>
          <li>route actions</li>
          <li>resource loaders</li>
          <li>resource actions</li>
          <li>API routes</li>
        </ul>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">RSC where it helps</h3>
        <p className="text-neutral-400 mb-4">
          Litz uses React Server Components as a transport for{" "}
          <code className="text-sky-400">view(...)</code> responses.
        </p>
        <p className="text-neutral-400 mb-4">
          That means you can return server-rendered UI fragments when they are useful, without
          forcing the whole application into an SSR-first architecture.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          A minimal route with server data
        </h2>
        <CodeBlock
          language="tsx"
          code={`import { data, defineRoute, server } from "litzjs";

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

  return <p>{profile?.user.name}</p>;
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Security model</h2>
        <p className="text-neutral-400 mb-4">
          Litz's boundaries are explicit, but they are still normal server request surfaces.
        </p>
        <p className="text-neutral-400 mb-4">
          You should treat all of the following as real endpoints:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>route loaders and actions</li>
          <li>resource loaders and actions</li>
          <li>API routes</li>
          <li>
            the <code className="text-sky-400">_litzjs/*</code> transport used internally by the
            runtime
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">That means a Litz app should still:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>authenticate and authorize requests</li>
          <li>validate params, search params, headers, and body input</li>
          <li>apply CSRF protections for cookie-backed writes</li>
          <li>
            avoid assuming a request is trusted just because it comes through framework transport
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">When Litz is a good fit</h2>
        <p className="text-neutral-400 mb-4">Litz fits well when you want:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>Vite-native development and build behavior</li>
          <li>a client-first app architecture</li>
          <li>explicit, understandable server boundaries</li>
          <li>reusable server-backed UI without turning everything into pages</li>
          <li>the option to use RSC selectively instead of globally</li>
        </ul>
      </section>

      <div className="flex justify-end pt-8 border-t border-neutral-800">
        <Link
          href="/docs/installation"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Installation &rarr;
        </Link>
      </div>
    </>
  );
}
