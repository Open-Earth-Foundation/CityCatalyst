import { createServer } from "http";
import { parse } from "url";
import next from "next";
import pinoHttp from "pino-http";
import { IncomingMessage } from "http";
import nextConfig from "./next.config.mjs";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, conf: nextConfig });
const handle = app.getRequestHandler();

const httpLogger = pinoHttp({
  customLogLevel: (
    req: IncomingMessage,
    res: any,
    err: Error | undefined,
  ): string => {
    if (err || (res && res.statusCode && res.statusCode >= 500)) {
      return "error";
    } else if (res && res.statusCode && res.statusCode >= 400) {
      return "warn";
    } else {
      return "info";
    }
  },
});

app.prepare().then(() => {
  createServer((req, res) => {
    httpLogger(req, res, () => {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    });
  }).listen(port);

  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? "development" : process.env.NODE_ENV
    }`,
  );
});
