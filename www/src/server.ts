import { createServer } from "litzjs/server";

import { app } from "./app";

export default createServer({
  app,
  onError: (error) => {
    console.error("An error occurred:", error);
  },
});
