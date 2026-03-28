import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

import { CodeBlock } from "../../components/code-block";

interface CompatibilityRow {
  readonly packageName: string;
  readonly supportedVersion: string;
  readonly notes: string;
}

const compatibilityRows: readonly CompatibilityRow[] = [
  {
    packageName: "react",
    supportedVersion: "^19",
    notes: "Required peer dependency for route rendering, navigation, and view responses.",
  },
  {
    packageName: "react-dom",
    supportedVersion: "^19",
    notes: "Required peer dependency for client mounting and server rendering.",
  },
  {
    packageName: "typescript",
    supportedVersion: "^6.0.2",
    notes: "Required peer dependency for type-safe route definitions and the published types.",
  },
  {
    packageName: "vite",
    supportedVersion: "^8",
    notes: "Required peer dependency because Litz ships as a Vite-first framework plugin.",
  },
  {
    packageName: "@vitejs/plugin-rsc",
    supportedVersion: "^0.5.21",
    notes: "Required peer dependency for the React Server Components pipeline.",
  },
];

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
        <CodeBlock language="bash" code={`bun add litzjs`} />

        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">npm</h3>
        <CodeBlock language="bash" code={`npm install litzjs`} />

        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">Yarn</h3>
        <CodeBlock language="bash" code={`yarn add litzjs`} />

        <h3 className="text-xl font-medium text-neutral-100 mb-3 mt-6">pnpm</h3>
        <CodeBlock language="bash" code={`pnpm add litzjs`} />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Required peer dependencies</h2>
        <p className="text-neutral-400 mb-4">
          Litz expects your app to provide the full peer dependency surface below. If your React +
          Vite app already includes some of these packages, keep them within the supported ranges in
          the compatibility matrix.
        </p>
        <CodeBlock
          language="bash"
          code={`# With Bun
bun add react react-dom
bun add -d typescript vite @vitejs/plugin-rsc

# With npm
npm install react react-dom
npm install -D typescript vite @vitejs/plugin-rsc

# With Yarn
yarn add react react-dom
yarn add -D typescript vite @vitejs/plugin-rsc

# With pnpm
pnpm add react react-dom
pnpm add -D typescript vite @vitejs/plugin-rsc`}
        />
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mt-4 mb-4">
          <li>
            Install <code className="text-sky-400">react</code> and{" "}
            <code className="text-sky-400">react-dom</code> as application dependencies.
          </li>
          <li>
            Install <code className="text-sky-400">typescript</code>,{" "}
            <code className="text-sky-400">vite</code>, and{" "}
            <code className="text-sky-400">@vitejs/plugin-rsc</code> as development tooling.
          </li>
          <li>
            Treat all five packages as required peers even if your starter template already added
            some of them for you.
          </li>
        </ul>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">Compatibility matrix</h3>
        <p className="text-neutral-400 mb-4">
          These ranges mirror the current <code className="text-sky-400">litzjs</code> peer
          dependency declarations.
        </p>
        <div className="overflow-x-auto rounded-lg border border-neutral-800 mb-4">
          <table className="min-w-full text-left text-sm text-neutral-300">
            <thead className="bg-neutral-900/70 text-neutral-200">
              <tr>
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Supported version</th>
                <th className="px-4 py-3 font-medium">Why it matters</th>
              </tr>
            </thead>
            <tbody>
              {compatibilityRows.map((row) => (
                <tr key={row.packageName} className="border-t border-neutral-800">
                  <td className="px-4 py-3 align-top">
                    <code className="text-sky-400">{row.packageName}</code>
                  </td>
                  <td className="px-4 py-3 align-top text-neutral-100">{row.supportedVersion}</td>
                  <td className="px-4 py-3 align-top">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-xl font-medium text-neutral-100 mb-3">Runtime compatibility notes</h3>
        <p className="text-neutral-400 mb-4">
          Litz does not publish a single runtime engine floor in{" "}
          <code className="text-sky-400">package.json</code>. Runtime compatibility depends on the
          adapter you deploy, so validate your target against the relevant deployment guide:
        </p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <Link href="/docs/node" className="text-sky-400 hover:text-sky-300">
              Node.js
            </Link>{" "}
            for Express, Fastify, or standalone HTTP servers.
          </li>
          <li>
            <Link href="/docs/bun" className="text-sky-400 hover:text-sky-300">
              Bun
            </Link>{" "}
            for <code className="text-sky-400">Bun.serve()</code>-based deployments.
          </li>
          <li>
            <Link href="/docs/deno-deploy" className="text-sky-400 hover:text-sky-300">
              Deno Deploy
            </Link>{" "}
            for <code className="text-sky-400">Deno.serve()</code>-based deployments.
          </li>
          <li>
            <Link href="/docs/cloudflare-workers" className="text-sky-400 hover:text-sky-300">
              Cloudflare Workers
            </Link>{" "}
            when you need a Worker config with a compatible{" "}
            <code className="text-sky-400">compatibility_date</code> and{" "}
            <code className="text-sky-400">nodejs_compat</code>.
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
import { litz } from "litzjs/vite";

export default defineConfig({
  plugins: [litz()],
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Next steps</h2>
        <p className="text-neutral-400 mb-4">
          Head to{" "}
          <Link href="/docs/first-app" className="text-sky-400 hover:text-sky-300">
            First App
          </Link>{" "}
          for the empty-directory walkthrough before you fine-tune route discovery patterns and
          server entry options in Quick Start and Configuration.
        </p>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link href="/docs" className="text-neutral-400 hover:text-sky-400 transition-colors">
          &larr; Introduction
        </Link>
        <Link href="/docs/first-app" className="text-sky-500 hover:text-sky-400 transition-colors">
          First App &rarr;
        </Link>
      </div>
    </>
  );
}
