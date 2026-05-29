import { describe, expect, it } from "vitest";

import {
  MAX_DISPLAY_NAME_LENGTH,
  roomJoinPayloadSchema,
  strokeInputSchema
} from "./schema.js";

describe("contracts", () => {
  it("accepts a valid room join payload", () => {
    const payload = roomJoinPayloadSchema.parse({
      roomId: "demo-room",
      clientId: "client-1",
      displayName: "Ada"
    });

    expect(payload.roomId).toBe("demo-room");
  });

  it("rejects invalid stroke width", () => {
    expect(() =>
      strokeInputSchema.parse({
        kind: "stroke",
        id: "stroke-1",
        tool: "pen",
        color: "#000",
        width: 99,
        points: [{ x: 0, y: 0 }]
      })
    ).toThrow();
  });

  it("rejects display names longer than the shared limit", () => {
    expect(() =>
      roomJoinPayloadSchema.parse({
        roomId: "demo-room",
        clientId: "client-1",
        displayName: "A".repeat(MAX_DISPLAY_NAME_LENGTH + 1)
      })
    ).toThrow(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
  });
});
