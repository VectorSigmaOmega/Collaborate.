import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryRoomRepository } from "./inMemoryRoomRepository.js";
import { RoomService, RoomServiceError } from "./roomService.js";

const baseConfig = {
  PORT: 5000,
  NODE_ENV: "test" as const,
  CLIENT_ORIGIN: "http://localhost:5173",
  ROOM_REPOSITORY: "memory" as const,
  ROOM_STORAGE_PATH: ".data/room-service-test.json",
  ROOM_EMPTY_TTL_MS: 15 * 60 * 1000,
  ROOM_MAX_PARTICIPANTS: 15,
  ROOM_MAX_STROKES: 400,
  ROOM_MAX_STROKE_POINTS: 1200,
  ROOM_MAX_PAYLOAD_BYTES: 131_072,
  METRICS_ENABLED: true
};

describe("RoomService", () => {
  let roomService: RoomService;

  beforeEach(() => {
    roomService = new RoomService(new InMemoryRoomRepository(), baseConfig);
  });

  it("creates and joins a room", async () => {
    const result = await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    expect(result.snapshot.roomId).toBe("demo-room");
    expect(result.snapshot.participants).toHaveLength(1);
  });

  it("rejects duplicate names from different clients", async () => {
    await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    await expect(
      roomService.joinRoom({
        roomId: "demo-room",
        clientId: "client-2",
        displayName: "Ada",
        preferredColor: "#222222",
        socketId: "socket-2"
      })
    ).rejects.toBeInstanceOf(RoomServiceError);
  });

  it("assigns unique participant colors even when clients request the same color", async () => {
    const first = await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    const second = await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-2",
      displayName: "Grace",
      preferredColor: "#111111",
      socketId: "socket-2"
    });

    expect(second.participant.color).not.toBe(first.participant.color);
  });

  it("does not assign white or near-white participant colors", async () => {
    const unsafePreferredColors = [
      "#fff",
      "#f8fafc",
      "rgb(250, 250, 250)",
      "rgb(100%,100%,100%)",
      "hsl(0, 0%, 98%)",
      "white"
    ];

    for (const [index, preferredColor] of unsafePreferredColors.entries()) {
      const result = await roomService.joinRoom({
        roomId: "demo-room",
        clientId: `client-${index}`,
        displayName: `User ${index}`,
        preferredColor,
        socketId: `socket-${index}`
      });

      expect(result.participant.color).not.toBe(preferredColor);
      expect(result.participant.color).not.toMatch(/^#(?:fff|f8fafc|ffffff)$/i);
      expect(result.participant.color).not.toBe("white");
    }
  });

  it("generates extra participant colors beyond the fixed palette", async () => {
    const expandedRoomService = new RoomService(new InMemoryRoomRepository(), {
      ...baseConfig,
      ROOM_MAX_PARTICIPANTS: 20
    });

    const assignedColors = new Set<string>();

    for (let index = 0; index < 18; index += 1) {
      const result = await expandedRoomService.joinRoom({
        roomId: "busy-room",
        clientId: `client-${index}`,
        displayName: `User ${index}`,
        preferredColor: "#111111",
        socketId: `socket-${index}`
      });

      assignedColors.add(result.participant.color);
    }

    expect(assignedColors.size).toBe(18);
    expect([...assignedColors].some((color) => color.startsWith("hsl("))).toBe(true);
  });

  it("supports undo and redo for a user's own board items", async () => {
    await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    const commitResult = await roomService.commitItem("demo-room", "client-1", {
      kind: "stroke",
      id: "stroke-1",
      tool: "pen",
      color: "#111111",
      width: 3,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 }
      ]
    });

    expect(commitResult.item?.color).toBe("#111111");

    const undone = await roomService.undo("demo-room", "client-1");
    expect(undone.items).toHaveLength(0);
    expect(undone.canRedo).toBe(true);

    const redone = await roomService.redo("demo-room", "client-1");
    expect(redone.items).toHaveLength(1);
    expect(redone.canUndo).toBe(true);
  });

  it("commits, moves, undoes, and redoes shape and text items", async () => {
    await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    await roomService.commitItem("demo-room", "client-1", {
      kind: "shape",
      id: "shape-1",
      shape: "arrow",
      color: "#111111",
      width: 3,
      start: { x: 0, y: 0 },
      end: { x: 20, y: 20 }
    });
    await roomService.commitItem("demo-room", "client-1", {
      kind: "text",
      id: "text-1",
      color: "#111111",
      x: 10,
      y: 12,
      text: "Ship it",
      fontSize: 18
    });

    const moved = await roomService.moveItem("demo-room", "client-1", {
      id: "text-1",
      delta: { x: 8, y: -2 }
    });

    expect(moved.items).toHaveLength(2);
    expect(moved.items.find((item) => item.id === "text-1")).toMatchObject({
      x: 18,
      y: 10
    });

    const undone = await roomService.undo("demo-room", "client-1");
    expect(undone.items.find((item) => item.id === "text-1")).toMatchObject({
      x: 10,
      y: 12
    });
    expect(undone.canRedo).toBe(true);

    const redone = await roomService.redo("demo-room", "client-1");
    expect(redone.items.find((item) => item.id === "text-1")).toMatchObject({
      x: 18,
      y: 10
    });
  });

  it("creates grouped eraser attachments for every intersected item", async () => {
    await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    await roomService.commitItem("demo-room", "client-1", {
      kind: "stroke",
      id: "stroke-1",
      tool: "pen",
      color: "#111111",
      width: 6,
      points: [
        { x: 0, y: 10 },
        { x: 40, y: 10 }
      ]
    });

    await roomService.commitItem("demo-room", "client-1", {
      kind: "shape",
      id: "shape-1",
      shape: "rectangle",
      color: "#111111",
      width: 4,
      start: { x: 10, y: 0 },
      end: { x: 30, y: 20 }
    });

    await roomService.commitItem("demo-room", "client-1", {
      kind: "stroke",
      id: "erase-action",
      tool: "eraser",
      color: "#111111",
      width: 10,
      points: [
        { x: 20, y: -10 },
        { x: 20, y: 30 }
      ]
    });

    const snapshot = await roomService.resync("demo-room", "client-1");
    const eraserAttachments = snapshot.items.filter(
      (item) => item.kind === "stroke" && item.tool === "eraser"
    );

    expect(eraserAttachments).toHaveLength(2);
    expect(eraserAttachments.every((item) => item.actionId === "erase-action")).toBe(true);
    expect(eraserAttachments.map((item) => item.maskForItemId).sort()).toEqual(["shape-1", "stroke-1"]);

    const undone = await roomService.undo("demo-room", "client-1");
    expect(undone.items.filter((item) => item.kind === "stroke" && item.tool === "eraser")).toHaveLength(0);
    expect(undone.canRedo).toBe(true);

    const redone = await roomService.redo("demo-room", "client-1");
    expect(redone.items.filter((item) => item.kind === "stroke" && item.tool === "eraser")).toHaveLength(2);
  });

  it("does not allow eraser attachments to be moved", async () => {
    await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    await roomService.commitItem("demo-room", "client-1", {
      kind: "stroke",
      id: "stroke-1",
      tool: "pen",
      color: "#111111",
      width: 4,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 }
      ]
    });

    await roomService.commitItem("demo-room", "client-1", {
      kind: "stroke",
      id: "eraser-1",
      tool: "eraser",
      color: "#111111",
      width: 10,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 }
      ]
    });

    await expect(
      roomService.moveItem("demo-room", "client-1", {
        id: "eraser-1-0",
        delta: { x: 8, y: 4 }
      })
    ).rejects.toMatchObject({
      code: "INVALID_PAYLOAD"
    });
  });

  it("expires an empty room after ttl", async () => {
    await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });

    await roomService.leaveRoom("demo-room", "client-1");
    const expired = await roomService.expireRooms(Date.now() + baseConfig.ROOM_EMPTY_TTL_MS + 1);

    expect(expired).toContain("demo-room");
  });

  it("previews a lobby color without joining the room", async () => {
    const preview = await roomService.getLobbyPreview("demo-room", "client-1");

    expect(preview.suggestedColor).toBe("#2563eb");
    expect(preview.participants).toHaveLength(0);
  });

  it("previews an existing participant color for reconnects", async () => {
    await roomService.joinRoom({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada",
      preferredColor: "#111111",
      socketId: "socket-1"
    });
    await roomService.leaveRoom("demo-room", "client-1");

    const preview = await roomService.getLobbyPreview("demo-room", "client-1");

    expect(preview.suggestedColor).toBe("#111111");
  });
});
