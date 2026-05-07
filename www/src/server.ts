import { createServer } from "litzjs/server";
import { base } from "virtual:litzjs:base";
import { serverManifest } from "virtual:litzjs:server-manifest";

export default createServer({
  base,
  manifest: serverManifest,
  onError: (error) => {
    console.error("An error occurred:", error);
  },
});
