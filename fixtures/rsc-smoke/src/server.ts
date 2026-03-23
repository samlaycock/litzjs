import { createServer } from "litz/server";

export default createServer({
  onError(error) {
    console.error("Litz docs server error", error);
  },
});
