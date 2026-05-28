import cors from "cors";
import express from "express";

import type { AppConfig } from "../config/env.js";
import type { MetricsRegistry } from "../observability/metrics.js";
import { RoomServiceError, type RoomService } from "../rooms/roomService.js";

type ReadinessSnapshot = {
  ready: boolean;
  storage: "memory" | "file";
  storagePath?: string;
};

export function createHttpApp(
  config: AppConfig,
  metrics: MetricsRegistry,
  getReadiness: () => Promise<ReadinessSnapshot>,
  roomService: RoomService
) {
  const app = express();

  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      credentials: true
    })
  );

  const healthHandler = (_request: any, response: any) => {
    response.status(200).json({ status: "ok" });
  };

  const readyHandler = async (_request: any, response: any) => {
    const readiness = await getReadiness();

    response.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ready" : "not_ready",
      env: config.NODE_ENV,
      storage: readiness.storage,
      storagePath: readiness.storagePath
    });
  };

  const metricsHandler = (_request: any, response: any) => {
    response
      .status(200)
      .type("text/plain; version=0.0.4")
      .send(metrics.renderPrometheus());
  };

  const lobbyHandler = async (request: any, response: any) => {
    const clientId = typeof request.query.clientId === "string" ? request.query.clientId : "";
    const roomId = typeof request.params.roomId === "string" ? request.params.roomId : "";

    if (!clientId || !roomId) {
      response.status(400).json({
        code: "INVALID_PAYLOAD",
        message: "roomId and clientId are required."
      });
      return;
    }

    try {
      const preview = await roomService.getLobbyPreview(roomId, clientId);
      response.status(200).json(preview);
    } catch (error) {
      if (error instanceof RoomServiceError) {
        response.status(error.code === "ROOM_EXPIRED" ? 410 : 400).json({
          code: error.code,
          message: error.message
        });
        return;
      }

      throw error;
    }
  };

  app.get("/health", healthHandler);
  app.get("/ready", readyHandler);
  app.get("/metrics", metricsHandler);
  app.get("/rooms/:roomId/lobby", lobbyHandler);

  return app;
}
