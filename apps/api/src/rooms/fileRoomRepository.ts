import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

import type pino from "pino";
import { z } from "zod";

import { boardItemSchema, boardStrokeSchema, participantSchema } from "../contracts.js";
import type { RoomAction, RoomRecord, RoomRepository } from "./roomRepository.js";

const participantRecordSchema = participantSchema.extend({
  socketId: z.string().min(1).max(128),
  lastSeenAt: z.number().int().nonnegative()
});

const legacyBoardStrokeSchema = boardStrokeSchema.omit({ kind: true }).transform((stroke) => ({
  ...stroke,
  kind: "stroke" as const
}));

const persistedBoardItemSchema = z.union([boardItemSchema, legacyBoardStrokeSchema]);
const roomActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("append"),
    items: z.array(persistedBoardItemSchema)
  }),
  z.object({
    type: z.literal("move"),
    before: persistedBoardItemSchema,
    after: persistedBoardItemSchema
  })
]);
const redoEntrySchema = z.union([
  z.array(persistedBoardItemSchema),
  z.array(z.array(persistedBoardItemSchema))
]);
type PersistedBoardItem = z.infer<typeof persistedBoardItemSchema>;
type PersistedRoomAction = z.infer<typeof roomActionSchema>;

function normalizeActionHistory(
  entries: PersistedRoomAction[] | PersistedBoardItem[] | PersistedBoardItem[][]
): RoomAction[] {
  if (entries.length === 0) {
    return [];
  }

  if (typeof entries[0] === "object" && entries[0] !== null && "type" in entries[0]) {
    return entries as PersistedRoomAction[];
  }

  const legacyEntries = entries as PersistedBoardItem[] | PersistedBoardItem[][];
  if (Array.isArray(legacyEntries[0])) {
    return (legacyEntries as PersistedBoardItem[][]).map((items) => ({
      type: "append",
      items
    }));
  }

  return (legacyEntries as PersistedBoardItem[]).map((item) => ({
    type: "append",
    items: [item]
  }));
}

const roomRecordSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative().nullable(),
    participants: z.record(z.string(), participantRecordSchema),
    items: z.array(persistedBoardItemSchema).optional(),
    strokes: z.array(legacyBoardStrokeSchema).optional(),
    undoByClientId: z.record(z.string(), z.array(roomActionSchema)).optional(),
    redoByClientId: z.record(z.string(), z.union([z.array(roomActionSchema), redoEntrySchema])).optional()
  })
  .transform((room) => {
    const normalizedUndoByClientId = Object.fromEntries(
      Object.entries(room.undoByClientId ?? {}).map(([clientId, entries]) => [
        clientId,
        normalizeActionHistory(entries)
      ])
    ) as RoomRecord["undoByClientId"];
    const normalizedRedoByClientId = Object.fromEntries(
      Object.entries(room.redoByClientId ?? {}).map(([clientId, entries]) => [
        clientId,
        normalizeActionHistory(entries)
      ])
    ) as RoomRecord["redoByClientId"];

    return {
      id: room.id,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      expiresAt: room.expiresAt,
      participants: room.participants,
      items: room.items ?? room.strokes ?? [],
      undoByClientId: normalizedUndoByClientId,
      redoByClientId: normalizedRedoByClientId
    };
  });

const persistedStateSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  rooms: z.array(roomRecordSchema),
  expiredRooms: z.record(z.string(), z.number().int().nonnegative())
});

type PersistedState = z.infer<typeof persistedStateSchema>;

function cloneRoom(room: RoomRecord | null) {
  return room ? structuredClone(room) : null;
}

export class FileRoomRepository implements RoomRepository {
  private readonly state = {
    rooms: new Map<string, RoomRecord>(),
    expiredRooms: new Map<string, number>()
  };

  private ready = false;

  constructor(
    private readonly storagePath: string,
    private readonly logger: pino.Logger
  ) {}

  async init() {
    await mkdir(path.dirname(this.storagePath), { recursive: true });

    try {
      const raw = await readFile(this.storagePath, "utf8");
      const parsed = persistedStateSchema.parse(JSON.parse(raw)) as PersistedState;
      this.state.rooms.clear();
      this.state.expiredRooms.clear();

      for (const room of parsed.rooms) {
        this.state.rooms.set(room.id, room);
      }

      for (const [roomId, expiredAt] of Object.entries(parsed.expiredRooms)) {
        this.state.expiredRooms.set(roomId, expiredAt);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.persist();
      } else {
        this.logger.error({ err: error, storagePath: this.storagePath }, "Room storage init failed");
        throw error;
      }
    }

    this.ready = true;
  }

  async isReady() {
    return this.ready;
  }

  async getRoom(roomId: string) {
    this.assertReady();
    return cloneRoom(this.state.rooms.get(roomId) ?? null);
  }

  async saveRoom(room: RoomRecord) {
    this.assertReady();
    this.state.rooms.set(room.id, structuredClone(room));
    await this.persist();
  }

  async deleteRoom(roomId: string) {
    this.assertReady();
    this.state.rooms.delete(roomId);
    await this.persist();
  }

  async listRooms() {
    this.assertReady();
    return [...this.state.rooms.values()].map((room) => structuredClone(room));
  }

  async markExpiredRoom(roomId: string, expiredAt: number) {
    this.assertReady();
    this.state.expiredRooms.set(roomId, expiredAt);
    await this.persist();
  }

  async getExpiredAt(roomId: string) {
    this.assertReady();
    return this.state.expiredRooms.get(roomId) ?? null;
  }

  async clearExpiredRoom(roomId: string) {
    this.assertReady();
    if (this.state.expiredRooms.delete(roomId)) {
      await this.persist();
    }
  }

  private assertReady() {
    if (!this.ready) {
      throw new Error("FileRoomRepository.init() must complete before use.");
    }
  }

  private async persist() {
    const payload = JSON.stringify(
      {
        version: 2,
        rooms: [...this.state.rooms.values()],
        expiredRooms: Object.fromEntries(this.state.expiredRooms)
      },
      null,
      2
    );
    const tempPath = `${this.storagePath}.tmp`;

    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, this.storagePath);
  }
}
