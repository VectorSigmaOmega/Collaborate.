import type { BoardItem, Participant } from "../contracts.js";

export type ParticipantRecord = Participant & {
  socketId: string;
  lastSeenAt: number;
};

export type RoomAction =
  | {
      type: "append";
      items: BoardItem[];
    }
  | {
      type: "move";
      before: BoardItem;
      after: BoardItem;
    };

export type RoomRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  participants: Record<string, ParticipantRecord>;
  items: BoardItem[];
  undoByClientId: Record<string, RoomAction[]>;
  redoByClientId: Record<string, RoomAction[]>;
};

export interface RoomRepository {
  init(): Promise<void>;
  isReady(): Promise<boolean>;
  getRoom(roomId: string): Promise<RoomRecord | null>;
  saveRoom(room: RoomRecord): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  listRooms(): Promise<RoomRecord[]>;
  markExpiredRoom(roomId: string, expiredAt: number): Promise<void>;
  getExpiredAt(roomId: string): Promise<number | null>;
  clearExpiredRoom(roomId: string): Promise<void>;
}
