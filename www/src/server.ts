import { createServer } from "litzjs/server";

export default createServer({
  onError: (error) => {
    console.error("An error occurred:", error);
  },
});
