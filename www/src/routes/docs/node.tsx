import { defineRoute } from "litz";
import { Link } from "litz/client";

import { CodeBlock } from "../../components/code-block";

export const route = defineRoute("/docs/node", {
  component: DocsNodePage,
});

function DocsNodePage() {
  return (
    <>
      <title>Node.js | Litz</title>
      <h1 className="text-3xl font-bold text-neutral-50 mb-4">Node.js</h1>
      <p className="text-xl text-neutral-300 mb-8">
        Deploy Litz apps to Node.js with Express, Fastify, or as a standalone server.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Server entry</h2>
        <p className="text-neutral-400 mb-4">Create your Litz server entry:</p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litz/server";

export default createServer({
  async createContext(request) {
    // Parse cookies, sessions, etc.
    return { userId: null };
  },
  onError(error) {
    console.error("Server error:", error);
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Standalone server</h2>
        <p className="text-neutral-400 mb-4">Run directly with Node.js:</p>
        <CodeBlock
          language="ts"
          code={`import app from "./server/index.ts";
import http from "node:http";

const server = http.createServer((req, res) => {
  // Convert Node http request to Fetch API Request
  const request = new Request(req.url!, {
    method: req.method,
    headers: Object.fromEntries(Object.entries(req.headers)),
  });

  app.fetch(request).then((response) => {
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    
    if (response.body) {
      const reader = response.body.getReader();
      reader.read().then(({ done, value }) => {
        res.end(Buffer.from(value));
      });
    } else {
      res.end();
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          Note: For production, consider using a proper adapter like{" "}
          <code className="text-sky-400">fetch</code> to convert http.IncomingMessage to Request.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">With Express</h2>
        <CodeBlock
          language="ts"
          code={`import express from "express";
import app from "./server";

const server = express();

// Serve static files from dist/client
server.use(express.static("dist/client"));

// Litz handles all other requests
server.use((req, res) => {
  // Convert express request to Fetch API Request
  const protocol = req.protocol === "https" ? "https" : "http";
  const request = new Request(\`\${protocol}://\${req.get("host")}\${req.originalUrl}\`, {
    method: req.method,
    headers: Object.fromEntries(Object.entries(req.headers)) as HeadersInit,
  });

  app.fetch(request).then((response) => {
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    
    if (response.body) {
      response.body.pipe(res);
    } else {
      res.end();
    }
  });
});

server.listen(3000);`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">With Fastify</h2>
        <CodeBlock
          language="ts"
          code={`import Fastify from "fastify";
import app from "./server";

const server = Fastify({ logger: true });

server.get("*", async (request, reply) => {
  const response = await app.fetch(request.raw.url);
  reply.status(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  return response.body;
});

server.listen({ port: 3000 });`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production build</h2>
        <CodeBlock
          language="bash"
          code={`vite build`}
        />
        <p className="text-neutral-400 mt-4 mb-4">This generates:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">dist/client</code> — browser bundle
          </li>
          <li>
            <code className="text-sky-400">dist/server</code> — server bundle
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          With a custom server entry, Litz outputs a self-contained server that handles all requests.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Useful scripts</h2>
        <CodeBlock
          language="json"
          code={`{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "node server.js",
    "start:express": "node server-express.js",
    "start:fastify": "node server-fastify.js"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Verification checklist</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>App typechecks</li>
          <li>Vite build completes</li>
          <li>Server starts without errors</li>
          <li>Static assets are served correctly</li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link
          href="/docs/bun"
          className="text-neutral-400 hover:text-sky-400 transition-colors"
        >
          &larr; Bun
        </Link>
        <Link
          href="/docs/api-reference"
          className="text-sky-500 hover:text-sky-400 transition-colors"
        >
          API Reference &rarr;
        </Link>
      </div>
    </>
  );
}