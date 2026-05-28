import { io as clientIo, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type BoardItem,
  type BoardSnapshot,
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
});
