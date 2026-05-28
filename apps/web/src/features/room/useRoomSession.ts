import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  translateBoardItem,
  type BoardCapabilities,
  type BoardItem,
  type BoardItemInput,
  type BoardItemMovePayload,
  type BoardSnapshot,
  type RoomErrorPayload,
  type RoomJoinPayload,
  type RoomStatus
} from "@collaborate/contracts";

type JoinPayload = RoomJoinPayload;

type RoomSessionState = {
  joined: boolean;
  joining: boolean;
  status: RoomStatus["status"];
  snapshot: BoardSnapshot | null;
  error: RoomErrorPayload | null;
  expired: boolean;
};

const SOCKET_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:5000";

export function useRoomSession(roomId: string) {
  const socket = useMemo(
    () =>
      io(SOCKET_URL, {
        autoConnect: false,
        transports: ["websocket"]
      }),
    []
  );

  const [state, setState] = useState<RoomSessionState>({
    joined: false,
    joining: false,
    status: "idle",
    snapshot: null,
    error: null,
    expired: false
  });

  const joinRequestRef = useRef<JoinPayload | null>(null);
  const manualLeaveRef = useRef(false);
  const previewMapRef = useRef<Map<string, BoardItem>>(new Map());
  const [previewItems, setPreviewItems] = useState<BoardItem[]>([]);

  useEffect(() => {
    const syncPreviewItems = () => {
      setPreviewItems([...previewMapRef.current.values()]);
    };

    const emitJoin = () => {
      const joinPayload = joinRequestRef.current;
      if (!joinPayload) {
        return;
      }

      setState((current) => ({
        ...current,
        joining: true,
        status: current.joined ? "syncing" : "connecting"
      }));
      socket.emit(CLIENT_EVENTS.roomJoin, joinPayload);
    };

    socket.on("connect", emitJoin);
    socket.on("disconnect", () => {
      setState((current) => ({
        ...current,
        status: manualLeaveRef.current ? "disconnected" : "reconnecting"
      }));
    });

    socket.on(SERVER_EVENTS.roomStatus, (status: RoomStatus) => {
      setState((current) => ({ ...current, status: status.status }));
    });

    socket.on(SERVER_EVENTS.roomSync, (snapshot: BoardSnapshot) => {
      previewMapRef.current.clear();
      syncPreviewItems();
      setState({
        joined: true,
        joining: false,
        status: "connected",
        snapshot,
        error: null,
        expired: false
      });
    });

    socket.on(SERVER_EVENTS.roomPresence, (participants: BoardSnapshot["participants"]) => {
      setState((current) =>
        current.snapshot
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                participants
              }
            }
          : current
      );
    });

    socket.on(SERVER_EVENTS.itemPreview, (item: BoardItem) => {
      if (item.clientId === joinRequestRef.current?.clientId) {
        return;
      }
      previewMapRef.current.set(item.id, item);
      syncPreviewItems();
    });

    socket.on(SERVER_EVENTS.itemCommitted, (item: BoardItem) => {
      previewMapRef.current.delete(item.id);
      setState((current) => {
        if (!current.snapshot || item.clientId === joinRequestRef.current?.clientId) {
          return current;
        }

        const existing = current.snapshot.items.find((entry) => entry.id === item.id);
        if (existing) {
          return current;
        }

        return {
          ...current,
          snapshot: {
            ...current.snapshot,
            items: [...current.snapshot.items, item]
          }
        };
      });
      syncPreviewItems();
    });

    socket.on(SERVER_EVENTS.boardReplaced, (items: BoardItem[]) => {
      previewMapRef.current.clear();
      setState((current) =>
        current.snapshot
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                items
              }
            }
          : current
      );
      syncPreviewItems();
    });

    socket.on(SERVER_EVENTS.boardCapabilities, (capabilities: BoardCapabilities) => {
      setState((current) =>
        current.snapshot
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                canUndo: capabilities.canUndo,
                canRedo: capabilities.canRedo
              }
            }
          : current
      );
    });

    socket.on(SERVER_EVENTS.roomError, (error: RoomErrorPayload) => {
      const expired = error.code === "ROOM_EXPIRED";
      if (expired) {
        previewMapRef.current.clear();
        syncPreviewItems();
      }
      setState((current) => ({
        ...current,
        joining: false,
        joined: expired ? false : current.joined,
        error,
        expired,
        status: expired ? "disconnected" : current.status
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

  const joinRoom = (payload: Omit<JoinPayload, "roomId">) => {
    manualLeaveRef.current = false;
    joinRequestRef.current = {
      roomId,
      ...payload
    };
    setState((current) => ({
      ...current,
      joining: true,
      error: null,
      expired: false,
      status: "connecting"
    }));

    if (!socket.connected) {
      socket.connect();
      return;
    }

    socket.emit(CLIENT_EVENTS.roomJoin, joinRequestRef.current);
  };

  const leaveRoom = () => {
    manualLeaveRef.current = true;
    joinRequestRef.current = null;
    if (socket.connected) {
      socket.emit(CLIENT_EVENTS.roomLeave);
    }
    socket.disconnect();
    previewMapRef.current.clear();
    setPreviewItems([]);
    setState({
      joined: false,
      joining: false,
      status: "disconnected",
      snapshot: null,
      error: null,
      expired: false
    });
  };

  const requestResync = () => {
    socket.emit(CLIENT_EVENTS.roomResync, {});
  };

  const sendPreviewItem = (item: BoardItemInput) => {
    if (!state.joined) {
      return;
    }
    socket.emit(CLIENT_EVENTS.itemPreview, item);
  };

  const commitItem = (item: BoardItemInput) => {
    if (!state.joined) {
      return;
    }

    previewMapRef.current.delete(item.id);
    setPreviewItems([...previewMapRef.current.values()]);
    setState((current) => {
      if (!current.snapshot || !joinRequestRef.current) {
        return current;
      }

      return {
        ...current,
        snapshot: {
          ...current.snapshot,
          items: [
            ...current.snapshot.items,
            {
              ...item,
              clientId: joinRequestRef.current.clientId
            } as BoardItem
          ],
          canUndo: true,
          canRedo: false
        }
      };
    });
    socket.emit(CLIENT_EVENTS.itemCommit, item);
  };

  const moveItem = (payload: BoardItemMovePayload) => {
    if (!state.joined) {
      return;
    }

    setState((current) =>
      current.snapshot
        ? {
            ...current,
            snapshot: {
              ...current.snapshot,
              items: current.snapshot.items.map((item) =>
                item.id === payload.id ? translateBoardItem(item, payload.delta) : item
              )
            }
          }
        : current
    );
    socket.emit(CLIENT_EVENTS.itemMove, payload);
  };

  const undo = () => socket.emit(CLIENT_EVENTS.undo, {});
  const redo = () => socket.emit(CLIENT_EVENTS.redo, {});
  const clearMine = () => socket.emit(CLIENT_EVENTS.clearMine, {});

  return {
    ...state,
    previewItems,
    joinRoom,
    leaveRoom,
    requestResync,
    sendPreviewItem,
    commitItem,
    moveItem,
    undo,
    redo,
    clearMine
  };
}
