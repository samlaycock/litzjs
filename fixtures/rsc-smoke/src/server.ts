import { createServer } from "litzjs/server";
import { base } from "virtual:litzjs:base";
import { serverManifest } from "virtual:litzjs:server-manifest";

export default createServer({
  assets(request) {
    const url = new URL(request.url);

    if (url.pathname === "/server-asset.txt") {
      return new Response("served by createServer assets", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    return null;
  },
  base,
  createContext(request) {
    return {
      requestId: request.headers.get("x-fixture-request-id") ?? "fixture-request",
    };
  },
  manifest: serverManifest,
  notFound: "<!doctype html><title>Fixture Not Found</title><h1>Fixture Not Found</h1>",
  onError: (error) => {
    console.error("An error occurred:", error);
  },
});
