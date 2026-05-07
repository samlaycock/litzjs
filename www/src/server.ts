import { createServer } from "litzjs/server";
import { serverManifest } from "virtual:litzjs:server-manifest";

export default createServer({
  manifest: serverManifest,
  onError: (error) => {
    console.error("An error occurred:", error);
  },
});
