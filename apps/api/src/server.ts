import { createServer } from "node:http";

import { Server } from "socket.io";

import { createHttpApp } from "./http/createHttpApp.js";
import { createLogger } from "./logging/logger.js";
import { MetricsRegistry } from "./observability/metrics.js";
import { createRoomRepository } from "./rooms/createRoomRepository.js";
import { startRoomExpiryLoop } from "./rooms/roomExpiryLoop.js";
import { RoomService } from "./rooms/roomService.js";
import type { AppConfig } from "./config/env.js";
import { registerSocketHandlers } from "./socket/registerSocketHandlers.js";

export async function createApiServer(config: AppConfig) {
  const logger = createLogger();
  const metrics = new MetricsRegistry();
  const repository = createRoomRepository(config, logger);
  await repository.init();
  const roomService = new RoomService(repository, config);
  const app = createHttpApp(
    config,
    metrics,
    async () => ({
      ready: await repository.isReady(),
      storage: config.ROOM_REPOSITORY,
      storagePath: config.ROOM_REPOSITORY === "file" ? config.ROOM_STORAGE_PATH : undefined
    }),
    roomService
  );

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: config.CLIENT_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  registerSocketHandlers(io, roomService, config, logger, metrics);
  const expiryTimer = startRoomExpiryLoop(roomService, logger, metrics);
  const initialStats = await roomService.getStats();
  metrics.setRoomStats(initialStats.activeRooms, initialStats.activeParticipants);

  logger.info(
    {
      storage: config.ROOM_REPOSITORY,
      storagePath: config.ROOM_REPOSITORY === "file" ? config.ROOM_STORAGE_PATH : undefined
    },
    "Room repository ready"
  );

  return {
    app,
    io,
    httpServer,
    logger,
    metrics,
    roomService,
    async start(port = config.PORT) {
      await new Promise<void>((resolve) => {
        httpServer.listen(port, resolve);
      });
      const address = httpServer.address();
      const resolvedPort =
        typeof address === "object" && address && "port" in address ? address.port : port;
      logger.info({ port: resolvedPort }, "Collaborate API listening");
      return resolvedPort;
    },
    async stop() {
      clearInterval(expiryTimer);
      await new Promise<void>((resolve, reject) => {
        io.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          if (!httpServer.listening) {
            resolve();
            return;
          }

          httpServer.close((closeError) => {
            if (
              closeError &&
              !("code" in closeError && closeError.code === "ERR_SERVER_NOT_RUNNING")
            ) {
              reject(closeError);
              return;
            }
            resolve();
          });
        });
      });
    }
  };
}
