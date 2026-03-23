import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/quick-start", {
  component: DocsQuickStartPage,
});

function DocsQuickStartPage() {
  return (
    <>
      <title>Quick Start | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Quick Start</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Mount the Litz runtime, keep a normal Vite document, and create your first explicit route.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Mount the app</h2>
        <p className="text-neutral-400 mb-4">
          Create <code className="text-sky-400">src/main.tsx</code>:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { mountApp } from "litzjs/client";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Missing "#app" root element.');
}

mountApp(root);`}
        />

        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">Optional wrapper</h3>
        <p className="text-neutral-400 mb-4">
          You can pass a wrapper component via the options object:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { StrictMode } from "react";
import { mountApp } from "litzjs/client";

mountApp(root, { component: StrictMode });`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          For wrappers that need props, define your own component:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { mountApp } from "litzjs/client";

function AppProviders({ children }: React.PropsWithChildren) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

mountApp(root, { component: AppProviders });`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Keep the document simple</h2>
        <p className="text-neutral-400 mb-4">
          Your <code className="text-sky-400">index.html</code> can stay completely normal:
        </p>
        <CodeBlock
          language="html"
          code={`<!doctype html>
<html lang="en">
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Create your first route</h2>
        <p className="text-neutral-400 mb-4">
          Create <code className="text-sky-400">src/routes/index.tsx</code>:
        </p>
        <CodeBlock
          language="tsx"
          code={`import { defineRoute } from "litzjs";

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
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          Add a loader when you need server data
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
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Result hooks</h2>
        <p className="text-neutral-400 mb-4">Routes expose layered result hooks:</p>
        <ul className="text-neutral-400 space-y-2 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">useLoaderResult()</code> and{" "}
            <code className="text-sky-400">useActionResult()</code> for raw normalized result
            branches
          </li>
          <li>
            <code className="text-sky-400">useLoaderData()</code> and{" "}
            <code className="text-sky-400">useLoaderView()</code> for loader-specific values
          </li>
          <li>
            <code className="text-sky-400">useActionData()</code>,{" "}
            <code className="text-sky-400">useActionView()</code>, and{" "}
            <code className="text-sky-400">useActionError()</code> for action-specific values
          </li>
          <li>
            <code className="text-sky-400">useData()</code>,{" "}
            <code className="text-sky-400">useView()</code>, and{" "}
            <code className="text-sky-400">useError()</code> for the latest settled value regardless
            of source
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/installation"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Installation
        </Link>
        <Link href="/docs/routing" className="text-sky-500 hover:text-sky-400 transition-colors">
          Routing &rarr;
        </Link>
      </div>
    </>
  );
}
