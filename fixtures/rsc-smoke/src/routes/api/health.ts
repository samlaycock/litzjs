import { defineApiRoute } from "volt";

export const api = defineApiRoute("/api/health", {
  GET() {
    return Response.json({
      ok: true,
      runtime: "volt-fixture",
    });
  },
});
