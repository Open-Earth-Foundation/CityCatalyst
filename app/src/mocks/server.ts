import { createServer } from "miragejs";

export default function () {
  createServer({
    routes() {
      this.get("/api/test", () => ({
        test: ["test 1", "test 2", "test 3"],
      }));
    },
  });
}
