import pino from "pino";
// import pinoLoki from "pino-loki";

const LOG_LEVEL =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

console.log("Use Loki: " + !!process.env.USE_LOKI);

/* const transport = !!process.env.USE_LOKI
  ? pinoLoki({
      batching: true,
      interval: 5,
      host: "http://localhost:3100",
      headers: {
        Authorization: `Bearer ${process.env.LOKI_AUTH_TOKEN}`,
      },
    })
  : undefined;
*/
export const logger = pino(
  {
    timestamp: pino.stdTimeFunctions.isoTime,
    level: LOG_LEVEL,
    formatters: {
      level(label, number) {
        return { level: label };
      },
      log(object) {
        return object;
      },
    },
  },
  // transport,
);

logger.info("Module 1!");
logger.warn("Module 2!");
logger.error("Module 3!");
