import { createServer } from "litz/server";

export default createServer({
  onError: (error) => {
    console.error("An error occurred:", error);
  },
});
