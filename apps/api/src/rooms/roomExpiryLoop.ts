import type pino from "pino";

import type { MetricsRegistry } from "../observability/metrics.js";
import { RoomService } from "./roomService.js";

export function startRoomExpiryLoop(
  roomService: RoomService,
  logger: pino.Logger,
  metrics: MetricsRegistry
) {
  const timer = setInterval(async () => {
    try {
      const expiredRooms = await roomService.expireRooms();
      if (expiredRooms.length > 0) {
        for (const roomId of expiredRooms) {
          logger.info({ roomId }, "Room expired");
          metrics.incRoomExpirations();
        }
        const stats = await roomService.getStats();
        metrics.setRoomStats(stats.activeRooms, stats.activeParticipants);
      }
    } catch (error) {
      logger.error({ err: error }, "Room expiry loop failed");
    }
  }, 5_000);

  timer.unref();
  return timer;
}
