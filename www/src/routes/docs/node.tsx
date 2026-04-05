import { defineRoute } from "litzjs";
import { Link } from "litzjs/client";

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
        Deploy Litz apps to Node.js by serving <code className="text-sky-400">.output/public</code>{" "}
        as static files and forwarding everything else to the built Litz handler in{" "}
        <code className="text-sky-400">.output/server/index.mjs</code>.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Server entry</h2>
        <p className="text-neutral-400 mb-4">
          Keep your Litz server entry small. Vite injects the discovered manifest during{" "}
          <code className="text-sky-400">vite build</code>:
        </p>
        <CodeBlock
          language="ts"
          code={`import { createServer } from "litzjs/server";

export default createServer({
  async createContext(request) {
    return {
      requestId: request.headers.get("x-request-id"),
    };
  },
  onError(error, context) {
    console.error("Node deployment error", { error, context });
  },
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Production shape</h2>
        <p className="text-neutral-400 mb-4">A production build gives you two outputs:</p>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>
            <code className="text-sky-400">.output/public</code> for the document shell and browser
            assets
          </li>
          <li>
            <code className="text-sky-400">.output/server/index.mjs</code> for the fetch-style Litz
            handler
          </li>
        </ul>
        <p className="text-neutral-400 mb-4">
          In Node, the production job is always the same: serve{" "}
          <code className="text-sky-400">.output/public</code> directly, convert Node requests into
          web <code className="text-sky-400">Request</code> objects, then call{" "}
          <code className="text-sky-400">app.fetch(request)</code>.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Shared Node adapter</h2>
        <p className="text-neutral-400 mb-4">
          Reuse one adapter helper across bare Node, Express, or Fastify so request streaming and
          response streaming behave the same in production:
        </p>
        <CodeBlock
          language="ts"
          code={`import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

export function toWebRequest(request: IncomingMessage, origin: string) {
  const url = new URL(request.url ?? "/", origin);
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }

      continue;
    }

    headers.set(name, value);
  }

  const method = request.method ?? "GET";
  const hasBody = !METHODS_WITHOUT_BODY.has(method);

  return new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(request) as BodyInit) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

export async function sendWebResponse(response: Response, reply: ServerResponse) {
  reply.statusCode = response.status;
  response.headers.forEach((value, name) => reply.setHeader(name, value));

  if (!response.body) {
    reply.end();
    return;
  }

  await pipeline(Readable.fromWeb(response.body), reply);
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Standalone Node server</h2>
        <p className="text-neutral-400 mb-4">
          Use this when you want to run only Node&apos;s built-in HTTP server in production:
        </p>
        <CodeBlock
          language="ts"
          code={`import http from "node:http";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import app from "./.output/server/index.mjs";
import { sendWebResponse, toWebRequest } from "./node-adapter.js";

const port = Number(process.env.PORT ?? 3000);
const clientDir = path.resolve(".output/public");

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? "/", "http://internal").pathname;
    const isStaticFile = pathname.startsWith("/assets/");

    if (isStaticFile) {
      try {
        await pipeline(createReadStream(path.join(clientDir, pathname.slice(1))), res);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      if (res.writableEnded || res.destroyed) {
        return;
      }
    }

    if (pathname === "/favicon.ico" || pathname === "/robots.txt") {
      try {
        await pipeline(createReadStream(path.join(clientDir, pathname.slice(1))), res);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      if (res.writableEnded || res.destroyed) {
        return;
      }
    }

    if (pathname === "/index.html") {
      try {
        await pipeline(createReadStream(path.join(clientDir, "index.html")), res);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      if (res.writableEnded || res.destroyed) {
        return;
      }
    }

    if (res.writableEnded || res.destroyed) {
      return;
    }

    const host = req.headers.host ?? \`localhost:\${port}\`;
    const response = await app.fetch(toWebRequest(req, \`http://\${host}\`));
    await sendWebResponse(response, res);
  } catch (error) {
    console.error("Node adapter error", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(port, () => {
  console.log(\`Node server listening on http://localhost:\${port}\`);
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          This recipe is production-safe for the Litz transport because it preserves request method,
          headers, request bodies, and streamed responses. Add your own cache headers around the
          static asset branch if you need aggressive CDN behavior.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">With Express</h2>
        <p className="text-neutral-400 mb-4">
          Express is the most direct Node deployment path when you want explicit static asset
          handling and middleware:
        </p>
        <CodeBlock
          language="ts"
          code={`import express from "express";
import path from "node:path";
import app from "./.output/server/index.mjs";
import { sendWebResponse, toWebRequest } from "./node-adapter.js";

const server = express();
const clientDir = path.resolve(".output/public");
const port = Number(process.env.PORT ?? 3000);

server.disable("x-powered-by");
server.use(
  "/assets",
  express.static(path.join(clientDir, "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);
server.use(express.static(clientDir, { index: false }));

server.use(async (req, res, next) => {
  try {
    const origin = \`\${req.protocol}://\${req.get("host")}\`;
    const response = await app.fetch(toWebRequest(req, origin));
    await sendWebResponse(response, res);
  } catch (error) {
    next(error);
  }
});

server.listen(port, () => {
  console.log(\`Express server listening on http://localhost:\${port}\`);
});`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">With Fastify</h2>
        <p className="text-neutral-400 mb-4">
          Fastify works well when you want Fastify plugins around the same Litz handler. Register{" "}
          <code className="text-sky-400">@fastify/static</code> for the built client output, then
          hand off unmatched requests to the fetch handler:
        </p>
        <CodeBlock
          language="ts"
          code={`import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import app from "./.output/server/index.mjs";
import { sendWebResponse, toWebRequest } from "./node-adapter.js";

const server = Fastify({ logger: true });
const clientDir = path.resolve(".output/public");

await server.register(fastifyStatic, {
  root: path.join(clientDir, "assets"),
  prefix: "/assets/",
});

await server.register(fastifyStatic, {
  root: clientDir,
  decorateReply: false,
  wildcard: false,
  index: false,
});

server.all("*", async (request, reply) => {
  reply.hijack();

  try {
    const origin = \`\${request.protocol}://\${request.headers.host}\`;
    const response = await app.fetch(toWebRequest(request.raw, origin));
    await sendWebResponse(response, reply.raw);
  } catch (error) {
    request.log.error(error);

    if (!reply.raw.writableEnded && !reply.raw.destroyed) {
      reply.raw.statusCode = 500;
      reply.raw.setHeader("content-type", "text/plain; charset=utf-8");
      reply.raw.end("Internal Server Error");
    }
  }
});

await server.listen({
  host: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
});`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          Once you call <code className="text-sky-400">reply.hijack()</code>, Fastify no longer owns
          error handling for that request. Keep the explicit{" "}
          <code className="text-sky-400">try/catch</code>, log failures, and write the fallback{" "}
          <code className="text-sky-400">500</code> response yourself.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Build and start commands</h2>
        <CodeBlock
          language="bash"
          code={`vite build
node ./server/node-http.js
# or
node ./server/express.js
# or
node ./server/fastify.js`}
        />
        <p className="text-neutral-400 mt-4 mb-4">
          Build first so the adapter imports the generated{" "}
          <code className="text-sky-400">.output/server/index.mjs</code> bundle instead of the
          source-only development entry.
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
    "start:node": "node ./server/node-http.js",
    "start:express": "node ./server/express.js",
    "start:fastify": "node ./server/fastify.js"
  }
}`}
        />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-neutral-100 mb-4">Verification checklist</h2>
        <ul className="text-neutral-400 space-y-1 list-disc list-inside mb-4">
          <li>App typechecks</li>
          <li>Vite build completes</li>
          <li>The selected Node adapter starts without errors</li>
          <li>
            <code className="text-sky-400">/assets/*</code> is served directly from{" "}
            <code className="text-sky-400">.output/public</code>
          </li>
          <li>Document requests still hydrate correctly in the browser</li>
          <li>
            <code className="text-sky-400">/_litzjs/*</code> and{" "}
            <code className="text-sky-400">/api/*</code> still reach the server handler
          </li>
        </ul>
      </section>

      <div className="flex justify-between pt-8 border-t border-neutral-800">
        <Link href="/docs/bun" className="text-neutral-400 hover:text-sky-400 transition-colors">
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
