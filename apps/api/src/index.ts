import { loadConfig } from "./config/env.js";
import { createApiServer } from "./server.js";

const config = loadConfig();
const server = await createApiServer(config);

let shuttingDown = false;

const shutdown = async (signal: string, exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.logger.info({ signal }, "Shutting down Collaborate API");

  try {
    await server.stop();
    process.exit(exitCode);
  } catch (error) {
    server.logger.fatal({ err: error, signal }, "API shutdown failed");
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  server.logger.fatal({ err: reason }, "Unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  server.logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

await server.start(config.PORT);
