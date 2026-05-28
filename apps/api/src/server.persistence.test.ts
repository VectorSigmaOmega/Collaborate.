import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { io as clientIo, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLIENT_EVENTS, SERVER_EVENTS, type BoardCapabilities, type BoardSnapshot } from "./contracts.js";
import { createApiServer } from "./server.js";

const storageRootPrefix = path.join(os.tmpdir(), "collaborate-api-");

describe("api persistence", () => {
  let sockets: Socket[] = [];
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(storageRootPrefix);
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    sockets = [];

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  const connectClient = (baseUrl: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = clientIo(baseUrl, {
        transports: ["websocket"]
      });

      sockets.push(socket);
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });

  it("rehydrates room state after an api restart when file storage is enabled", async () => {
    const storagePath = path.join(tempDir, "rooms.json");
    const config = {
      PORT: 0,
      NODE_ENV: "test" as const,
      CLIENT_ORIGIN: "http://localhost:4173",
      ROOM_REPOSITORY: "file" as const,
      ROOM_STORAGE_PATH: storagePath,
      ROOM_EMPTY_TTL_MS: 15 * 60 * 1000,
      ROOM_MAX_PARTICIPANTS: 15,
      ROOM_MAX_STROKES: 400,
      ROOM_MAX_STROKE_POINTS: 1200,
      ROOM_MAX_PAYLOAD_BYTES: 131_072,
      METRICS_ENABLED: true
    };

    const firstServer = await createApiServer(config);
    const firstPort = await firstServer.start(0);
    const firstUrl = `http://127.0.0.1:${firstPort}`;

    const alice = await connectClient(firstUrl);
    const initialSync = new Promise<BoardSnapshot>((resolve) => {
      alice.once(SERVER_EVENTS.roomSync, resolve);
    });

    alice.emit(CLIENT_EVENTS.roomJoin, {
      roomId: "persisted-room",
      clientId: "alice-client",
      displayName: "Alice",
      preferredColor: "#111111"
    });

    await initialSync;

    const commitAck = new Promise<BoardCapabilities>((resolve) => {
      alice.once(SERVER_EVENTS.boardCapabilities, resolve);
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

    await commitAck;
    alice.disconnect();
    await firstServer.stop();

    const secondServer = await createApiServer(config);
    const secondPort = await secondServer.start(0);
    const secondUrl = `http://127.0.0.1:${secondPort}`;

    const readyResponse = await fetch(`${secondUrl}/ready`);
    expect(readyResponse.status).toBe(200);
    await expect(readyResponse.json()).resolves.toMatchObject({
      status: "ready",
      storage: "file"
    });

    const lobbyResponse = await fetch(`${secondUrl}/rooms/persisted-room/lobby?clientId=bob-client`);
    expect(lobbyResponse.status).toBe(200);
    await expect(lobbyResponse.json()).resolves.toMatchObject({
      roomId: "persisted-room",
      suggestedColor: "#2563eb"
    });

    const bob = await connectClient(secondUrl);
    const restoredSync = new Promise<BoardSnapshot>((resolve) => {
      bob.once(SERVER_EVENTS.roomSync, resolve);
    });

    bob.emit(CLIENT_EVENTS.roomJoin, {
      roomId: "persisted-room",
      clientId: "bob-client",
      displayName: "Bob",
      preferredColor: "#222222"
    });

    const restoredSnapshot = await restoredSync;
    expect(restoredSnapshot.items).toHaveLength(1);
    expect(restoredSnapshot.items[0]?.id).toBe("stroke-1");

    await secondServer.stop();
  });
});
