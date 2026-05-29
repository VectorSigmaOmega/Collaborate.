import type pino from "pino";
import type { Server, Socket } from "socket.io";
import { z, type ZodType } from "zod";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  boardItemInputSchema,
  boardItemMovePayloadSchema,
  boardCapabilitiesSchema,
  roomErrorSchema,
  roomJoinPayloadSchema,
  roomStatusSchema,
  type RoomErrorCode
} from "../contracts.js";

import type { AppConfig } from "../config/env.js";
import type { MetricsRegistry } from "../observability/metrics.js";
import { RoomService, RoomServiceError } from "../rooms/roomService.js";

type SocketState = {
  roomId?: string;
  clientId?: string;
  displayName?: string;
  tokens?: number;
  updatedAt?: number;
};

function getPayloadBytes(raw: unknown) {
  return Buffer.byteLength(JSON.stringify(raw ?? null), "utf8");
}

function consumeRateLimit(socket: Socket<any, any, any, SocketState>) {
  const now = Date.now();
  const capacity = 240;
  const refillPerSecond = 90;
  const tokens = socket.data.tokens ?? capacity;
  const updatedAt = socket.data.updatedAt ?? now;
  const elapsedSeconds = Math.max(0, (now - updatedAt) / 1000);
  const replenished = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);

  if (replenished < 1) {
    socket.data.tokens = replenished;
    socket.data.updatedAt = now;
    return false;
  }

  socket.data.tokens = replenished - 1;
  socket.data.updatedAt = now;
  return true;
}

function emitRoomError(
  socket: Socket<any, any, any, SocketState>,
  code: RoomErrorCode,
  message: string
) {
  socket.emit(SERVER_EVENTS.roomError, roomErrorSchema.parse({ code, message }));
}

export function registerSocketHandlers(
  io: Server,
  roomService: RoomService,
  config: AppConfig,
  logger: pino.Logger,
  metrics: MetricsRegistry
) {
  const emptyPayloadSchema = z.object({}).passthrough();

  io.on("connection", (socket) => {
    socket.emit(SERVER_EVENTS.roomStatus, roomStatusSchema.parse({ status: "connected" }));

    const syncMetrics = async () => {
      const stats = await roomService.getStats();
      metrics.setRoomStats(stats.activeRooms, stats.activeParticipants);
    };

    const reject = (eventName: string, code: RoomErrorCode, message: string) => {
      metrics.incRejectedEvents();
      logger.warn(
        {
          eventName,
          roomId: socket.data.roomId,
          clientId: socket.data.clientId,
          code
        },
        message
      );
      emitRoomError(socket, code, message);
    };

    const ensureJoined = () => {
      const roomId = socket.data.roomId;
      const clientId = socket.data.clientId;

      if (!roomId || !clientId) {
        throw new RoomServiceError("UNAUTHORIZED", "Join a room before sending board events.");
      }

      return { roomId, clientId };
    };

    const guardedHandler = <T>(
      eventName: string,
      schema: ZodType<T>,
      handler: (payload: T) => Promise<void> | void
    ) =>
      async (raw: unknown) => {
        try {
          if (getPayloadBytes(raw) > config.ROOM_MAX_PAYLOAD_BYTES) {
            reject(eventName, "INVALID_PAYLOAD", "Payload exceeds size limit.");
            return;
          }

          if (!consumeRateLimit(socket)) {
            reject(eventName, "RATE_LIMITED", "Too many events sent too quickly.");
            return;
          }

          const payload = schema.parse(raw) as T;
          await handler(payload);
        } catch (error) {
          if (error instanceof RoomServiceError) {
            reject(eventName, error.code, error.message);
            return;
          }

          if (error instanceof z.ZodError) {
            reject(eventName, "INVALID_PAYLOAD", error.issues[0]?.message ?? "Invalid payload.");
            return;
          }

          logger.error({ err: error, eventName }, "Socket handler failed");
          metrics.incSocketErrors();
          reject(eventName, "UNKNOWN", "Unexpected server error.");
        }
      };

    socket.on(
      CLIENT_EVENTS.roomJoin,
      guardedHandler(CLIENT_EVENTS.roomJoin, roomJoinPayloadSchema, async (payload) => {
        if (socket.data.roomId && socket.data.clientId) {
          await roomService.leaveRoom(socket.data.roomId, socket.data.clientId);
          await socket.leave(socket.data.roomId);
        }

        const { snapshot, participant } = await roomService.joinRoom({
          ...payload,
          socketId: socket.id
        });

        socket.data.roomId = payload.roomId;
        socket.data.clientId = payload.clientId;
        socket.data.displayName = participant.displayName;

        await socket.join(payload.roomId);

        socket.emit(SERVER_EVENTS.roomSync, snapshot);
        socket.emit(SERVER_EVENTS.boardCapabilities, boardCapabilitiesSchema.parse({
          canUndo: snapshot.canUndo,
          canRedo: snapshot.canRedo
        }));
        io.to(payload.roomId).emit(SERVER_EVENTS.roomPresence, snapshot.participants);

        logger.info(
          { roomId: payload.roomId, clientId: payload.clientId, displayName: participant.displayName },
          "Participant joined room"
        );
        await syncMetrics();
      })
    );

    socket.on(
      CLIENT_EVENTS.roomResync,
      guardedHandler(CLIENT_EVENTS.roomResync, emptyPayloadSchema, async () => {
        const { roomId, clientId } = ensureJoined();
        socket.emit(SERVER_EVENTS.roomStatus, roomStatusSchema.parse({ status: "syncing" }));
        const snapshot = await roomService.resync(roomId, clientId);
        socket.emit(SERVER_EVENTS.roomSync, snapshot);
        socket.emit(SERVER_EVENTS.boardCapabilities, boardCapabilitiesSchema.parse({
          canUndo: snapshot.canUndo,
          canRedo: snapshot.canRedo
        }));
        socket.emit(SERVER_EVENTS.roomStatus, roomStatusSchema.parse({ status: "connected" }));
      })
    );

    socket.on(
      CLIENT_EVENTS.itemPreview,
      guardedHandler(CLIENT_EVENTS.itemPreview, boardItemInputSchema, async (payload) => {
        const { roomId, clientId } = ensureJoined();
        const previewItem = await roomService.previewItem(roomId, clientId, payload);
        socket.to(roomId).emit(SERVER_EVENTS.itemPreview, previewItem);
      })
    );

    socket.on(
      CLIENT_EVENTS.itemCommit,
      guardedHandler(CLIENT_EVENTS.itemCommit, boardItemInputSchema, async (payload) => {
        const { roomId, clientId } = ensureJoined();
        const result = await roomService.commitItem(roomId, clientId, payload);
        if (result.replaced) {
          io.to(roomId).emit(SERVER_EVENTS.boardReplaced, result.items ?? []);
        } else {
          socket.to(roomId).emit(SERVER_EVENTS.itemCommitted, result.item!);
        }
        socket.emit(SERVER_EVENTS.boardCapabilities, result.capabilities);
      })
    );

    socket.on(
      CLIENT_EVENTS.itemMove,
      guardedHandler(CLIENT_EVENTS.itemMove, boardItemMovePayloadSchema, async (payload) => {
        const { roomId, clientId } = ensureJoined();
        const snapshot = await roomService.moveItem(roomId, clientId, payload);
        io.to(roomId).emit(SERVER_EVENTS.boardReplaced, snapshot.items);
      })
    );

    socket.on(
      CLIENT_EVENTS.undo,
      guardedHandler(CLIENT_EVENTS.undo, emptyPayloadSchema, async () => {
        const { roomId, clientId } = ensureJoined();
        const snapshot = await roomService.undo(roomId, clientId);
        io.to(roomId).emit(SERVER_EVENTS.boardReplaced, snapshot.items);
        socket.emit(SERVER_EVENTS.boardCapabilities, {
          canUndo: snapshot.canUndo,
          canRedo: snapshot.canRedo
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.redo,
      guardedHandler(CLIENT_EVENTS.redo, emptyPayloadSchema, async () => {
        const { roomId, clientId } = ensureJoined();
        const snapshot = await roomService.redo(roomId, clientId);
        io.to(roomId).emit(SERVER_EVENTS.boardReplaced, snapshot.items);
        socket.emit(SERVER_EVENTS.boardCapabilities, {
          canUndo: snapshot.canUndo,
          canRedo: snapshot.canRedo
        });
      })
    );

    socket.on(
      CLIENT_EVENTS.clearMine,
      guardedHandler(CLIENT_EVENTS.clearMine, emptyPayloadSchema, async () => {
        const { roomId, clientId } = ensureJoined();
        const snapshot = await roomService.clearMine(roomId, clientId);
        io.to(roomId).emit(SERVER_EVENTS.boardReplaced, snapshot.items);
        socket.emit(SERVER_EVENTS.boardCapabilities, {
          canUndo: snapshot.canUndo,
          canRedo: snapshot.canRedo
        });
      })
    );

    socket.on(CLIENT_EVENTS.roomLeave, async () => {
      if (!socket.data.roomId || !socket.data.clientId) {
        return;
      }

      const snapshot = await roomService.leaveRoom(socket.data.roomId, socket.data.clientId);
      logger.info(
        { roomId: socket.data.roomId, clientId: socket.data.clientId },
        "Participant left room"
      );
      await socket.leave(socket.data.roomId);
      if (snapshot) {
        io.to(snapshot.roomId).emit(SERVER_EVENTS.roomPresence, snapshot.participants);
      }
      socket.data.roomId = undefined;
      socket.data.clientId = undefined;
      socket.emit(SERVER_EVENTS.roomStatus, roomStatusSchema.parse({ status: "disconnected" }));
      await syncMetrics();
    });

    socket.on("disconnect", async () => {
      if (socket.data.roomId && socket.data.clientId) {
        const snapshot = await roomService.leaveRoom(socket.data.roomId, socket.data.clientId);
        if (snapshot) {
          io.to(snapshot.roomId).emit(SERVER_EVENTS.roomPresence, snapshot.participants);
        }
        logger.info(
          { roomId: socket.data.roomId, clientId: socket.data.clientId },
          "Participant disconnected"
        );
      }
      await syncMetrics();
    });
  });
}
