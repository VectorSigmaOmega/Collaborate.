import { io as clientIo, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type BoardItem,
  type BoardSnapshot,
  type RoomErrorPayload,
} from "../contracts.js";

import { createApiServer } from "../server.js";

describe("socket transport", () => {
  let baseUrl = "";
  let stopServer: (() => Promise<void>) | null = null;
  let sockets: Socket[] = [];

  beforeEach(async () => {
    const server = await createApiServer({
      PORT: 0,
      NODE_ENV: "test",
      CLIENT_ORIGIN: "http://localhost:4173",
      ROOM_REPOSITORY: "memory",
      ROOM_STORAGE_PATH: ".data/socket-test.json",
      ROOM_EMPTY_TTL_MS: 15 * 60 * 1000,
      ROOM_MAX_PARTICIPANTS: 15,
      ROOM_MAX_STROKES: 400,
      ROOM_MAX_STROKE_POINTS: 1200,
      ROOM_MAX_PAYLOAD_BYTES: 131_072,
      METRICS_ENABLED: true
    });

    const port = await server.start(0);
    baseUrl = `http://127.0.0.1:${port}`;
    stopServer = () => server.stop();
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    sockets = [];
    if (stopServer) {
      await stopServer();
    }
  });

  const connectClient = () =>
    new Promise<Socket>((resolve, reject) => {
      const socket = clientIo(baseUrl, {
        transports: ["websocket"]
      });
      sockets.push(socket);
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });

  it("syncs room state and broadcasts committed board items", async () => {
    const alice = await connectClient();
    const bob = await connectClient();

    const aliceSync = new Promise<BoardSnapshot>((resolve) => {
      alice.once(SERVER_EVENTS.roomSync, resolve);
    });

    alice.emit(CLIENT_EVENTS.roomJoin, {
      roomId: "demo-room",
      clientId: "alice-client",
      displayName: "Alice",
      preferredColor: "#111111"
    });

    await aliceSync;

    const bobSync = new Promise<BoardSnapshot>((resolve) => {
      bob.once(SERVER_EVENTS.roomSync, resolve);
    });

    bob.emit(CLIENT_EVENTS.roomJoin, {
      roomId: "demo-room",
      clientId: "bob-client",
      displayName: "Bob",
      preferredColor: "#222222"
    });

    await bobSync;

    const committedItem = new Promise<BoardItem>((resolve) => {
      bob.once(SERVER_EVENTS.itemCommitted, resolve);
    });

    alice.emit(CLIENT_EVENTS.itemCommit, {
      kind: "stroke",
      id: "stroke-1",
      tool: "pen",
      color: "#111111",
      width: 3,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 }
      ]
    });

    const item = await committedItem;
    expect(item.clientId).toBe("alice-client");
    expect(item.color).toBe("#111111");
  });

  it("replaces the board when an eraser commit affects multiple items", async () => {
    const alice = await connectClient();
    const bob = await connectClient();

    const aliceSync = new Promise<BoardSnapshot>((resolve) => {
      alice.once(SERVER_EVENTS.roomSync, resolve);
    });

    alice.emit(CLIENT_EVENTS.roomJoin, {
      roomId: "erase-room",
      clientId: "alice-client",
      displayName: "Alice",
      preferredColor: "#111111"
    });

    await aliceSync;

    const bobSync = new Promise<BoardSnapshot>((resolve) => {
      bob.once(SERVER_EVENTS.roomSync, resolve);
    });

    bob.emit(CLIENT_EVENTS.roomJoin, {
      roomId: "erase-room",
      clientId: "bob-client",
      displayName: "Bob",
      preferredColor: "#222222"
    });

    await bobSync;

    const firstCommit = new Promise<BoardItem>((resolve) => {
      bob.once(SERVER_EVENTS.itemCommitted, resolve);
    });

    alice.emit(CLIENT_EVENTS.itemCommit, {
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
    await firstCommit;

    const secondCommit = new Promise<BoardItem>((resolve) => {
      bob.once(SERVER_EVENTS.itemCommitted, resolve);
    });

    alice.emit(CLIENT_EVENTS.itemCommit, {
      kind: "shape",
      id: "shape-1",
      shape: "rectangle",
      color: "#111111",
      width: 4,
      start: { x: 10, y: 0 },
      end: { x: 30, y: 20 }
    });
    await secondCommit;

    const replacedBoard = new Promise<BoardSnapshot["items"]>((resolve) => {
      bob.once(SERVER_EVENTS.boardReplaced, resolve);
    });

    alice.emit(CLIENT_EVENTS.itemCommit, {
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

    const items = await replacedBoard;
    expect(items.filter((item) => item.kind === "stroke" && item.tool === "eraser")).toHaveLength(2);
  });

  it("rejects overlong join names as invalid payloads", async () => {
    const socket = await connectClient();

    const roomError = new Promise<RoomErrorPayload>((resolve) => {
      socket.once(SERVER_EVENTS.roomError, resolve);
    });

    socket.emit(CLIENT_EVENTS.roomJoin, {
      roomId: "demo-room",
      clientId: "long-name-client",
      displayName: "A".repeat(21),
      preferredColor: "#111111"
    });

    await expect(roomError).resolves.toMatchObject({
      code: "INVALID_PAYLOAD",
      message: "Display name must be 20 characters or fewer."
    });
  });
});
