import { describe, expect, it } from "vitest";

describe("session helpers", () => {
  it("creates url-safe room ids", () => {
    const roomId = crypto.randomUUID();
    expect(roomId).toMatch(/^[a-z0-9-]+$/i);
  });
});
