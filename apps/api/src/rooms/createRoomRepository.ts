import path from "node:path";

import type pino from "pino";

import type { AppConfig } from "../config/env.js";
import { FileRoomRepository } from "./fileRoomRepository.js";
import { InMemoryRoomRepository } from "./inMemoryRoomRepository.js";

export function createRoomRepository(config: AppConfig, logger: pino.Logger) {
  if (config.ROOM_REPOSITORY === "memory") {
    return new InMemoryRoomRepository();
  }

  const storagePath = path.resolve(process.cwd(), config.ROOM_STORAGE_PATH);
  return new FileRoomRepository(storagePath, logger);
}
