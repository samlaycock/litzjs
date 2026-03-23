import { createServer } from "litzjs/server";

export default createServer({
  onError(error) {
    console.error("Litz docs server error", error);
  },
});
