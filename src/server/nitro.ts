/**
 * Nitro integration for the Litz server.
 *
 * Provides a utility to wrap a Litz server instance in a Nitro-compatible
 * handler. The h3 event's `req` property is a web-standard `Request` (via
 * srvx), which is passed directly to the Litz server pipeline.
 */
import { defineHandler } from "nitro/h3";

import type { CreateServerOptions } from "./index";

import { createServer } from "./index";

/**
 * Creates a Nitro-compatible event handler that delegates all requests to a
 * Litz server's `fetch` method.
 *
 * This is the primary integration point between Nitro and Litz — it allows the
 * entire Litz request pipeline (middleware, input validation, loaders, actions,
 * RSC rendering) to run inside a Nitro handler.
 */
export function createNitroHandler<TContext = unknown>(
  options: CreateServerOptions<TContext> = {},
) {
  const server = createServer(options);

  return defineHandler(async (event) => {
    return server.fetch(event.req);
  });
}
