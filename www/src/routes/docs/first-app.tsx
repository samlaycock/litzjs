import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/first-app", {
  component: DocsFirstAppPage,
});

function DocsFirstAppPage() {
  return (
    <>
      <title>First App | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">First App</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Start from an empty directory and get a Litz app running in the browser.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">What you will build</h2>
        <p className="text-neutral-400 mb-4">
          This walkthrough uses Bun for one copy-pasteable happy path. By the end you will have a
          Vite app with the Litz plugin, a browser entry, and a home route that renders at{" "}
          <code className="text-sky-400">http://localhost:5173</code>.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          1. Create an empty project directory
        </h2>
        <CodeBlock
          language="bash"
          code={`mkdir hello-litz
cd hello-litz
bun init -y`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          2. Install Litz and the required packages
        </h2>
        <p className="text-neutral-400 mb-4">
          Install the runtime packages first, then the TypeScript and Vite tooling:
        </p>
        <CodeBlock
          language="bash"
          code={`bun add litzjs react react-dom
bun add -d typescript vite @vitejs/plugin-rsc @types/react @types/react-dom`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">3. Add a TypeScript config</h2>
        <p className="text-neutral-400 mb-4">
          Create <code className="text-sky-400">tsconfig.json</code>:
        </p>
        <CodeBlock
          language="json"
          code={`{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          4. Add the Litz Vite plugin
        </h2>
        <p className="text-neutral-400 mb-4">
          Create <code className="text-sky-400">vite.config.ts</code>:
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [litz()],
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">
          5. Create the browser entry and document
        </h2>
        <p className="text-neutral-400 mb-4">
          Create <code className="text-sky-400">index.html</code>:
        </p>
        <CodeBlock
          language="html"
          code={`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hello Litz</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`}
        />
        <p className="text-neutral-400 mt-6 mb-4">
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
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">6. Create your first route</h2>
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
      <h1>Hello Litz</h1>
      <p>Your first Litz app is running.</p>
    </main>
  );
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">7. Start the dev server</h2>
        <p className="text-neutral-400 mb-4">Run Vite directly from Bun in the same directory:</p>
        <CodeBlock language="bash" code={`bunx vite`} />
        <p className="text-neutral-400 mt-4 mb-4">
          Open <code className="text-sky-400">http://localhost:5173</code>. If everything is wired
          correctly, the page shows <code className="text-sky-400">Hello Litz</code> and{" "}
          <code className="text-sky-400">Your first Litz app is running.</code>
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Next steps</h2>
        <p className="text-neutral-400 mb-4">
          Once the app is running, move on to{" "}
          <Link href="/docs/quick-start" className="text-sky-400 hover:text-sky-300">
            Quick Start
          </Link>{" "}
          for the minimal reference setup, optional wrappers, and the first loader example.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/installation"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Installation
        </Link>
        <Link
          href="/docs/quick-start"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Quick Start &rarr;
        </Link>
      </div>
    </>
  );
}
