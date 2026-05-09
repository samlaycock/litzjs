import { defineApiRoute } from "litzjs";

interface FixtureContext {
  readonly requestId: string;
}

export const api = defineApiRoute<FixtureContext>("/api/echo/:id", {
  input: {
    body: async (request) => {
      if (request.method === "GET" || request.method === "HEAD") {
        return null;
      }

      return request.json();
    },
    params: (params) => {
      if (!params.id) {
        throw new Response("Missing id", { status: 400 });
      }

      return {
        id: params.id.toUpperCase(),
      };
    },
    search: (search) => {
      return {
        tab: search.get("tab") ?? "default",
      };
    },
  },
  ALL({ context, input, request }) {
    return Response.json({
      body: input.body,
      id: input.params.id,
      method: request.method,
      requestId: context.requestId,
      tab: input.search.tab,
    });
  },
});
