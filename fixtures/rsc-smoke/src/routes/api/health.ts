import { defineApiRoute } from "litzjs";

export const api = defineApiRoute("/api/health", {
  GET() {
    return Response.json({
      ok: true,
      runtime: "litz-fixture",
    });
  },
});
