import pino from "pino";

export function createLogger() {
  return pino({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
