import type {
  BoardCapabilities,
  BoardItem,
  BoardItemInput,
  BoardItemMovePayload,
  BoardSnapshot,
  Participant,
  RoomErrorCode,
  RoomJoinPayload,
} from "../contracts.js";
import { translateBoardItem } from "../contracts.js";

import type { AppConfig } from "../config/env.js";
import type { RoomRecord, RoomRepository } from "./roomRepository.js";

export class RoomServiceError extends Error {
  constructor(
    public readonly code: RoomErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RoomServiceError";
  }
}

type JoinRoomInput = RoomJoinPayload & {
  socketId: string;
};

type RoomStats = {
  activeRooms: number;
  activeParticipants: number;
};

export type LobbyPreview = {
  roomId: string;
  suggestedColor: string;
  participants: Participant[];
  roomFull: boolean;
  expiresAt: number | null;
};

const IDENTITY_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be123c",
  "#4f46e5",
  "#16a34a",
  "#c2410c",
  "#0f766e",
  "#9333ea",
  "#ca8a04",
  "#0284c7",
  "#db2777"
];

const MAX_SAFE_IDENTITY_LUMINANCE = 0.78;

type RgbColor = {
  red: number;
  green: number;
  blue: number;
};

const NAMED_IDENTITY_COLORS: Record<string, RgbColor> = {
  black: { red: 0, green: 0, blue: 0 },
  white: { red: 255, green: 255, blue: 255 }
};

export class RoomService {
  constructor(
    private readonly repository: RoomRepository,
    private readonly config: AppConfig
  ) {}

  async joinRoom(input: JoinRoomInput) {
    const existingExpiredAt = await this.repository.getExpiredAt(input.roomId);
    if (existingExpiredAt) {
      throw new RoomServiceError("ROOM_EXPIRED", "This room has expired.");
    }

    let room = await this.repository.getRoom(input.roomId);
    const now = Date.now();

    if (!room) {
      room = {
        id: input.roomId,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
        participants: {},
        items: [],
        redoByClientId: {}
      };
    }

    const existingParticipant = room.participants[input.clientId];
    const activeParticipants = this.getConnectedParticipants(room);
    const normalizedName = input.displayName.trim().toLowerCase();
    const duplicateName = activeParticipants.find(
      (participant) =>
        participant.clientId !== input.clientId &&
        participant.displayName.trim().toLowerCase() === normalizedName
    );

    if (duplicateName) {
      throw new RoomServiceError("DUPLICATE_NAME", "Display name already taken in this room.");
    }

    const activeCountWithoutReconnect = activeParticipants.filter(
      (participant) => participant.clientId !== input.clientId
    ).length;

    if (!existingParticipant && activeCountWithoutReconnect >= this.config.ROOM_MAX_PARTICIPANTS) {
      throw new RoomServiceError("ROOM_FULL", "This room is already full.");
    }

    room.participants[input.clientId] = {
      clientId: input.clientId,
      displayName: input.displayName.trim(),
      color:
        this.getSafeExistingParticipantColor(existingParticipant) ??
        this.assignParticipantColor(room, input.clientId, input.preferredColor),
      connected: true,
      socketId: input.socketId,
      lastSeenAt: now
    };
    room.expiresAt = null;
    room.updatedAt = now;

    await this.repository.clearExpiredRoom(room.id);
    await this.repository.saveRoom(room);

    return {
      snapshot: this.toSnapshot(room, input.clientId),
      participant: this.toParticipant(room.participants[input.clientId])
    };
  }

  async getLobbyPreview(roomId: string, clientId: string): Promise<LobbyPreview> {
    const existingExpiredAt = await this.repository.getExpiredAt(roomId);
    if (existingExpiredAt) {
      throw new RoomServiceError("ROOM_EXPIRED", "This room has expired.");
    }

    const room = await this.repository.getRoom(roomId);
    const previewRoom =
      room ??
      ({
        id: roomId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: null,
        participants: {},
        items: [],
        redoByClientId: {}
      } satisfies RoomRecord);
    const connectedParticipants = this.getConnectedParticipants(previewRoom);

    return {
      roomId,
      suggestedColor:
        this.getSafeExistingParticipantColor(previewRoom.participants[clientId]) ??
        this.assignParticipantColor(previewRoom, clientId, undefined),
      participants: connectedParticipants.map((participant) => this.toParticipant(participant)),
      roomFull:
        !previewRoom.participants[clientId] &&
        connectedParticipants.length >= this.config.ROOM_MAX_PARTICIPANTS,
      expiresAt: previewRoom.expiresAt
    };
  }

  async leaveRoom(roomId: string, clientId: string) {
    const room = await this.repository.getRoom(roomId);
    if (!room) {
      return null;
    }

    const participant = room.participants[clientId];
    if (!participant) {
      return this.toSnapshot(room, clientId);
    }

    participant.connected = false;
    participant.lastSeenAt = Date.now();
    room.updatedAt = Date.now();

    if (this.getConnectedParticipants(room).length === 0) {
      room.expiresAt = Date.now() + this.config.ROOM_EMPTY_TTL_MS;
    }

    await this.repository.saveRoom(room);
    return this.toSnapshot(room, clientId);
  }

  async resync(roomId: string, clientId: string) {
    const room = await this.requireAuthorizedRoom(roomId, clientId);
    return this.toSnapshot(room, clientId);
  }

  async previewItem(roomId: string, clientId: string, item: BoardItemInput) {
    const room = await this.requireAuthorizedRoom(roomId, clientId);
    this.assertItemLimits(item);
    room.participants[clientId].lastSeenAt = Date.now();
    await this.repository.saveRoom(room);
    return this.asCommittedItem(clientId, item);
  }

  async commitItem(roomId: string, clientId: string, item: BoardItemInput) {
    const room = await this.requireAuthorizedRoom(roomId, clientId);
    this.assertItemLimits(item);

    if (item.kind === "stroke" && item.points.length < 2) {
      throw new RoomServiceError("INVALID_PAYLOAD", "Committed strokes need at least two points.");
    }

    const committedItem = this.asCommittedItem(clientId, item);
    room.items.push(committedItem);
    room.redoByClientId[clientId] = [];

    if (room.items.length > this.config.ROOM_MAX_STROKES) {
      room.items = room.items.slice(-this.config.ROOM_MAX_STROKES);
    }

    room.updatedAt = Date.now();
    room.participants[clientId].lastSeenAt = room.updatedAt;

    await this.repository.saveRoom(room);

    return {
      item: committedItem,
      capabilities: this.getCapabilities(room, clientId),
      replaced: false
    };
  }

  async moveItem(roomId: string, clientId: string, payload: BoardItemMovePayload) {
    const room = await this.requireAuthorizedRoom(roomId, clientId);
    const itemIndex = room.items.findIndex(
      (item) => item.id === payload.id && item.clientId === clientId
    );

    if (itemIndex < 0) {
      throw new RoomServiceError("UNAUTHORIZED", "You can only move your own board items.");
    }

    if (!this.isMovableItem(room.items[itemIndex])) {
      throw new RoomServiceError("INVALID_PAYLOAD", "Eraser marks cannot be moved.");
    }

    room.items[itemIndex] = translateBoardItem(room.items[itemIndex], payload.delta);
    room.updatedAt = Date.now();
    room.participants[clientId].lastSeenAt = room.updatedAt;
    await this.repository.saveRoom(room);

    return this.toSnapshot(room, clientId);
  }

  async undo(roomId: string, clientId: string) {
    const room = await this.requireAuthorizedRoom(roomId, clientId);
    const lastIndex = [...room.items]
      .map((item, index) => ({ item, index }))
      .reverse()
      .find((entry) => entry.item.clientId === clientId)?.index;

    if (lastIndex === undefined) {
      return this.toSnapshot(room, clientId);
    }

    const [removedItem] = room.items.splice(lastIndex, 1);
    room.redoByClientId[clientId] = [...(room.redoByClientId[clientId] ?? []), removedItem];
    room.updatedAt = Date.now();
    await this.repository.saveRoom(room);

    return this.toSnapshot(room, clientId);
  }

  async redo(roomId: string, clientId: string) {
    const room = await this.requireAuthorizedRoom(roomId, clientId);
    const redoStack = room.redoByClientId[clientId] ?? [];
    const restoredItem = redoStack.pop();

    if (!restoredItem) {
      return this.toSnapshot(room, clientId);
    }

    room.items.push(restoredItem);
    room.redoByClientId[clientId] = redoStack;
    room.updatedAt = Date.now();
    await this.repository.saveRoom(room);

    return this.toSnapshot(room, clientId);
  }

  async clearMine(roomId: string, clientId: string) {
    const room = await this.requireAuthorizedRoom(roomId, clientId);
    room.items = room.items.filter((item) => item.clientId !== clientId);
    room.redoByClientId[clientId] = [];
    room.updatedAt = Date.now();
    await this.repository.saveRoom(room);
    return this.toSnapshot(room, clientId);
  }

  async expireRooms(now = Date.now()) {
    const rooms = await this.repository.listRooms();
    const expired: string[] = [];

    for (const room of rooms) {
      if (room.expiresAt && room.expiresAt <= now) {
        expired.push(room.id);
        await this.repository.deleteRoom(room.id);
        await this.repository.markExpiredRoom(room.id, now);
      }
    }

    return expired;
  }

  async getStats(): Promise<RoomStats> {
    const rooms = await this.repository.listRooms();
    return {
      activeRooms: rooms.length,
      activeParticipants: rooms.reduce(
        (sum, room) => sum + this.getConnectedParticipants(room).length,
        0
      )
    };
  }

  private async requireAuthorizedRoom(roomId: string, clientId: string) {
    const room = await this.repository.getRoom(roomId);
    if (!room) {
      throw new RoomServiceError("ROOM_EXPIRED", "The room no longer exists.");
    }

    const participant = room.participants[clientId];
    if (!participant || !participant.connected) {
      throw new RoomServiceError("UNAUTHORIZED", "You must join the room first.");
    }

    return room;
  }

  private getConnectedParticipants(room: RoomRecord) {
    return Object.values(room.participants).filter((participant) => participant.connected);
  }

  private toParticipant(participant: RoomRecord["participants"][string]): Participant {
    return {
      clientId: participant.clientId,
      displayName: participant.displayName,
      color: participant.color,
      connected: participant.connected
    };
  }

  private toSnapshot(room: RoomRecord, clientId: string): BoardSnapshot {
    return {
      roomId: room.id,
      items: room.items,
      participants: this.getConnectedParticipants(room).map((participant) =>
        this.toParticipant(participant)
      ),
      canUndo: room.items.some((item) => item.clientId === clientId),
      canRedo: (room.redoByClientId[clientId] ?? []).length > 0,
      expiresAt: room.expiresAt
    };
  }

  private getCapabilities(room: RoomRecord, clientId: string): BoardCapabilities {
    return {
      canUndo: room.items.some((item) => item.clientId === clientId),
      canRedo: (room.redoByClientId[clientId] ?? []).length > 0
    };
  }

  private asCommittedItem(clientId: string, item: BoardItemInput): BoardItem {
    return {
      ...item,
      clientId
    } as BoardItem;
  }

  private assertItemLimits(item: BoardItemInput) {
    if (item.kind === "stroke" && item.points.length > this.config.ROOM_MAX_STROKE_POINTS) {
      throw new RoomServiceError("INVALID_PAYLOAD", "Stroke exceeds point limit.");
    }
  }

  private isMovableItem(item: BoardItem) {
    return !(item.kind === "stroke" && item.tool === "eraser");
  }

  private getSafeExistingParticipantColor(
    participant: RoomRecord["participants"][string] | undefined
  ) {
    return participant && this.isSafeIdentityColor(participant.color) ? participant.color : undefined;
  }

  private assignParticipantColor(
    room: RoomRecord,
    clientId: string,
    preferredColor: string | undefined
  ) {
    const usedColors = new Set(
      Object.entries(room.participants)
        .filter(([existingClientId]) => existingClientId !== clientId)
        .map(([, participant]) => participant.color)
    );

    if (
      preferredColor &&
      this.isSafeIdentityColor(preferredColor) &&
      !usedColors.has(preferredColor)
    ) {
      return preferredColor;
    }

    const paletteColor = IDENTITY_COLORS.find((color) => !usedColors.has(color));
    if (paletteColor) {
      return paletteColor;
    }

    for (let attempt = 0; attempt < 360; attempt += 1) {
      const hue = Math.round((this.hash(`${room.id}:${clientId}`) + attempt * 137.508) % 360);
      const generatedColor = `hsl(${hue}, 72%, 42%)`;
      if (!usedColors.has(generatedColor)) {
        return generatedColor;
      }
    }

    return `hsl(${Date.now() % 360}, 72%, 42%)`;
  }

  private isSafeIdentityColor(color: string) {
    const rgb = this.parseColorToRgb(color.trim());
    if (!rgb) {
      return false;
    }

    return this.getRelativeLuminance(rgb) <= MAX_SAFE_IDENTITY_LUMINANCE;
  }

  private parseColorToRgb(color: string): RgbColor | null {
    const normalizedColor = color.toLowerCase();
    const namedColor = NAMED_IDENTITY_COLORS[normalizedColor];
    if (namedColor) {
      return namedColor;
    }

    if (normalizedColor.startsWith("#")) {
      return this.parseHexColor(normalizedColor);
    }

    if (normalizedColor.startsWith("rgb")) {
      return this.parseRgbColor(normalizedColor);
    }

    if (normalizedColor.startsWith("hsl")) {
      return this.parseHslColor(normalizedColor);
    }

    return null;
  }

  private parseHexColor(color: string): RgbColor | null {
    if (/^#[0-9a-f]{3}$/.test(color)) {
      return {
        red: Number.parseInt(color[1] + color[1], 16),
        green: Number.parseInt(color[2] + color[2], 16),
        blue: Number.parseInt(color[3] + color[3], 16)
      };
    }

    if (/^#[0-9a-f]{6}$/.test(color)) {
      return {
        red: Number.parseInt(color.slice(1, 3), 16),
        green: Number.parseInt(color.slice(3, 5), 16),
        blue: Number.parseInt(color.slice(5, 7), 16)
      };
    }

    return null;
  }

  private parseRgbColor(color: string): RgbColor | null {
    const channelValues = color
      .replace(/^rgba?\(/, "")
      .replace(/\)$/, "")
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3);
    const channels = channelValues.map((value) =>
      value.endsWith("%") ? (Number.parseFloat(value) / 100) * 255 : Number.parseFloat(value)
    );

    if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
      return null;
    }

    return {
      red: this.clampColorChannel(channels[0]),
      green: this.clampColorChannel(channels[1]),
      blue: this.clampColorChannel(channels[2])
    };
  }

  private parseHslColor(color: string): RgbColor | null {
    const channels = color
      .replace(/^hsla?\(/, "")
      .replace(/\)$/, "")
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3);
    const hue = Number.parseFloat(channels[0]);
    const saturation = Number.parseFloat(channels[1]);
    const lightness = Number.parseFloat(channels[2]);

    if (
      channels.length !== 3 ||
      !Number.isFinite(hue) ||
      !Number.isFinite(saturation) ||
      !Number.isFinite(lightness)
    ) {
      return null;
    }

    const normalizedHue = (((hue % 360) + 360) % 360) / 360;
    const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100;
    const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100;

    if (normalizedSaturation === 0) {
      const gray = this.clampColorChannel(normalizedLightness * 255);
      return { red: gray, green: gray, blue: gray };
    }

    const q =
      normalizedLightness < 0.5
        ? normalizedLightness * (1 + normalizedSaturation)
        : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation;
    const p = 2 * normalizedLightness - q;

    return {
      red: this.clampColorChannel(this.hueToRgb(p, q, normalizedHue + 1 / 3) * 255),
      green: this.clampColorChannel(this.hueToRgb(p, q, normalizedHue) * 255),
      blue: this.clampColorChannel(this.hueToRgb(p, q, normalizedHue - 1 / 3) * 255)
    };
  }

  private hueToRgb(p: number, q: number, hue: number) {
    let normalizedHue = hue;
    if (normalizedHue < 0) {
      normalizedHue += 1;
    }
    if (normalizedHue > 1) {
      normalizedHue -= 1;
    }
    if (normalizedHue < 1 / 6) {
      return p + (q - p) * 6 * normalizedHue;
    }
    if (normalizedHue < 1 / 2) {
      return q;
    }
    if (normalizedHue < 2 / 3) {
      return p + (q - p) * (2 / 3 - normalizedHue) * 6;
    }
    return p;
  }

  private clampColorChannel(value: number) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  private getRelativeLuminance({ red, green, blue }: RgbColor) {
    const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
      const normalizedChannel = channel / 255;
      return normalizedChannel <= 0.03928
        ? normalizedChannel / 12.92
        : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
  }

  private hash(value: string) {
    let hash = 0;
    for (const character of value) {
      hash = (hash * 31 + character.charCodeAt(0)) % 360;
    }
    return hash;
  }
}
