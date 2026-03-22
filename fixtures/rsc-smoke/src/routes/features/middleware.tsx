import {
  data,
  defineRoute,
  server,
  type DataResult,
  type Middleware,
  type ServerResult,
  withHeaders,
} from "volt";

type MiddlewareContext = {
  trace: string[];
  note?: string;
};

type MiddlewareLoaderData = {
  trace: string[];
  note: string;
};

const seedTrace: Middleware<MiddlewareContext> = async (ctx, next) => {
  return next({
    context: {
      ...(ctx.context ?? { trace: [] }),
      trace: [...(ctx.context?.trace ?? []), "seed-trace"],
    },
  });
};

const attachNote: Middleware<MiddlewareContext> = async (ctx, next) => {
  return next({
    context: {
      ...(ctx.context ?? { trace: [] }),
      trace: [...(ctx.context?.trace ?? []), "attach-note"],
      note: "middleware updated context",
    },
  });
};

const responseTiming: Middleware<MiddlewareContext, ServerResult> = async (_ctx, next) => {
  const start = performance.now();
  const result = await next();
  const duration = performance.now() - start;

  return withHeaders(result, {
    "x-response-time": `${duration.toFixed(1)}ms`,
  });
};

export const route = defineRoute("/features/middleware", {
  component: MiddlewarePage,
  middleware: [seedTrace, attachNote, responseTiming],
  loader: server<MiddlewareContext, DataResult<MiddlewareLoaderData>>(async ({ context }) => {
    return data({
      trace: context.trace,
      note: context.note ?? "missing",
    });
  }),
});

function MiddlewarePage() {
  const loader = route.useLoaderResult();

  if (loader.kind !== "data") {
    return null;
  }

  return (
    <main>
      <h1>Middleware</h1>
      <p>Order: {loader.data.trace.join(" -> ")}</p>
      <p>Note: {loader.data.note}</p>
    </main>
  );
}
