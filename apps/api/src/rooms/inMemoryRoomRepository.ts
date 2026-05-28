import type { RoomRecord, RoomRepository } from "./roomRepository.js";

export class InMemoryRoomRepository implements RoomRepository {
  private rooms = new Map<string, RoomRecord>();
  private expiredRooms = new Map<string, number>();

  async init() {}

  async isReady() {
    return true;
  }

  async getRoom(roomId: string) {
    return this.rooms.get(roomId) ?? null;
  }

  async saveRoom(room: RoomRecord) {
    this.rooms.set(room.id, room);
  }

  async deleteRoom(roomId: string) {
    this.rooms.delete(roomId);
  }

  async listRooms() {
    return [...this.rooms.values()];
  }

  async markExpiredRoom(roomId: string, expiredAt: number) {
    this.expiredRooms.set(roomId, expiredAt);
  }

  async getExpiredAt(roomId: string) {
    return this.expiredRooms.get(roomId) ?? null;
  }

  async clearExpiredRoom(roomId: string) {
    this.expiredRooms.delete(roomId);
  }
}
