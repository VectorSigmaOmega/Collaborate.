import { describe, expect, it } from "vitest";

import { roomJoinPayloadSchema, strokeInputSchema } from "./schema.js";

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
});
