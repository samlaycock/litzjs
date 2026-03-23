import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/installation", {
  component: DocsInstallationPage,
});

function DocsInstallationPage() {
  return (
    <>
      <title>Installation | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Installation</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Install Litz and add the Vite plugin to a React application.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Package installation</h2>
        <p className="text-neutral-400 mb-4">Choose your package manager:</p>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">Bun</h3>
        <CodeBlock language="bash" code={`bun add litz`} />

        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">npm</h3>
        <CodeBlock language="bash" code={`npm install litz`} />

        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">Yarn</h3>
        <CodeBlock language="bash" code={`yarn add litz`} />

        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">pnpm</h3>
        <CodeBlock language="bash" code={`pnpm add litz`} />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Required peer dependencies</h2>
        <p className="text-neutral-400 mb-4">Litz requires these packages as dev dependencies:</p>
        <CodeBlock
          language="bash"
          code={`# With Bun
bun add -d react react-dom typescript @vitejs/plugin-rsc

# With npm
npm install -D react react-dom typescript @vitejs/plugin-rsc

# With Yarn
yarn add -D react react-dom typescript @vitejs/plugin-rsc

# With pnpm
pnpm add -D react react-dom typescript @vitejs/plugin-rsc`}
        />
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mt-4 mb-4">
          <li>
            <code className="text-sky-400">react</code> and{" "}
            <code className="text-sky-400">react-dom</code> — React 19
          </li>
          <li>
            <code className="text-sky-400">typescript</code> — TypeScript 5+
          </li>
          <li>
            <code className="text-sky-400">@vitejs/plugin-rsc</code> — RSC support for Vite
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Add the Vite plugin</h2>
        <p className="text-neutral-400 mb-4">
          Create or update <code className="text-sky-400">vite.config.ts</code>:
        </p>
        <CodeBlock
          language="ts"
          code={`import { defineConfig } from "vite";
import { litz } from "litz/vite";

export default defineConfig({
  plugins: [litz()],
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Next steps</h2>
        <p className="text-neutral-400 mb-4">
          Head to the{" "}
          <Link href="/docs/configuration" className="text-sky-400 hover:text-sky-300">
            Configuration
          </Link>{" "}
          page to customize route discovery patterns and server entry options.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link href="/docs" className="text-neutral-400 hover:text-sky-400 transition-colors">
          &larr; Introduction
        </Link>
        <Link
          href="/docs/configuration"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          Configuration &rarr;
        </Link>
      </div>
    </>
  );
}
