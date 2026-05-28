import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { BoardTool, Participant } from "@collaborate/contracts";

import { CopyButton } from "../components/CopyButton";
import { PresencePanel } from "../components/PresencePanel";
import { Toolbar } from "../components/Toolbar";
import { useBoardCanvas, type TextDraft } from "../features/board/useBoardCanvas";
import { useRoomSession } from "../features/room/useRoomSession";
import { DEFAULT_IDENTITY_COLOR, DEFAULT_STROKE_WIDTH } from "../lib/constants";
import {
  clearStoredActiveRoomId,
  getOrCreateClientId,
  getStoredActiveRoomId,
  getStoredDisplayName,
  storeActiveRoomId,
  storeDisplayName
} from "../lib/session";

const API_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:5000";

type LobbyPreview = {
  roomId: string;
  suggestedColor: string;
  participants: Participant[];
  roomFull: boolean;
  expiresAt: number | null;
};

type EditableTextDraft = TextDraft & {
  value: string;
};

export function RoomPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const clientId = useMemo(() => getOrCreateClientId(), []);
  const [displayName, setDisplayName] = useState(() => getStoredDisplayName());
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [activeTool, setActiveTool] = useState<BoardTool>("pen");
  const [inputError, setInputError] = useState(false);
  const [lobbyPreview, setLobbyPreview] = useState<LobbyPreview | null>(null);
  const [textDraft, setTextDraft] = useState<EditableTextDraft | null>(null);
  const autoJoinAttemptedRef = useRef(false);

  const session = useRoomSession(roomId);

  useEffect(() => {
    autoJoinAttemptedRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (session.joined) {
      storeActiveRoomId(roomId);
    }
  }, [roomId, session.joined]);

  useEffect(() => {
    if (session.expired) {
      clearStoredActiveRoomId(roomId);
    }
  }, [roomId, session.expired]);

  useEffect(() => {
    if (session.joined || session.expired || !roomId) {
      return;
    }

    const controller = new AbortController();
    const fetchLobbyPreview = async () => {
      const response = await fetch(
        `${API_URL}/rooms/${encodeURIComponent(roomId)}/lobby?clientId=${encodeURIComponent(
          clientId
        )}`,
        {
          signal: controller.signal
        }
      );

      if (!response.ok) {
        return;
      }

      setLobbyPreview((await response.json()) as LobbyPreview);
    };

    void fetchLobbyPreview().catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setLobbyPreview(null);
      }
    });

    return () => {
      controller.abort();
    };
  }, [clientId, roomId, session.expired, session.joined]);

  useEffect(() => {
    if (
      autoJoinAttemptedRef.current ||
      session.joined ||
      session.joining ||
      session.expired ||
      getStoredActiveRoomId() !== roomId ||
      !displayName.trim()
    ) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    session.joinRoom({
      clientId,
      displayName: displayName.trim(),
      preferredColor: lobbyPreview?.suggestedColor
    });
  }, [
    clientId,
    displayName,
    lobbyPreview?.suggestedColor,
    roomId,
    session,
    session.expired,
    session.joined,
    session.joining
  ]);

  const selfParticipant = session.snapshot?.participants.find(
    (participant) => participant.clientId === clientId
  );
  const assignedColor =
    selfParticipant?.color ?? lobbyPreview?.suggestedColor ?? DEFAULT_IDENTITY_COLOR;

  const { canvasRef, canvasProps, exportPng } = useBoardCanvas({
    enabled: session.joined,
    clientId,
    activeTool,
    activeColor: assignedColor,
    activeWidth: strokeWidth,
    items: session.snapshot?.items ?? [],
    previewItems: session.previewItems,
    onPreviewItem: session.sendPreviewItem,
    onCommitItem: session.commitItem,
    onMoveItem: session.moveItem,
    onStartTextDraft: (draft) => setTextDraft({ ...draft, value: "" })
  });

  const commitTextDraft = () => {
    if (!textDraft) {
      return;
    }

    const text = textDraft.value.trim();
    setTextDraft(null);

    if (!text) {
      return;
    }

    session.commitItem({
      kind: "text",
      id: textDraft.id,
      color: assignedColor,
      x: textDraft.x,
      y: textDraft.y,
      text,
      fontSize: textDraft.fontSize
    });
    setActiveTool("select");
  };

  const handleJoin = () => {
    if (!displayName.trim()) {
      setInputError(true);
      window.setTimeout(() => setInputError(false), 200);
      return;
    }

    storeDisplayName(displayName.trim());
    session.joinRoom({
      clientId,
      displayName: displayName.trim(),
      preferredColor: lobbyPreview?.suggestedColor
    });
  };

  const leaveRoom = () => {
    clearStoredActiveRoomId(roomId);
    session.leaveRoom();
    navigate("/");
  };

  if (!session.joined) {
    const errorMessage = session.expired
      ? "This room expired after being empty."
      : lobbyPreview?.roomFull
        ? "This room is already full."
      : session.error?.message ?? "";

    return (
      <main className="flex h-full items-center justify-center px-6">
        <section className="surface-panel relative flex h-[31rem] w-full max-w-sm flex-col justify-between rounded-xl p-10">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="absolute left-5 top-5 text-gray-400 transition-colors hover:text-black"
            title="Back"
          >
            <ArrowLeft size={24} />
          </button>

          <div className="mt-8 text-center">
            <h1 className="mb-2 text-3xl font-bold text-gray-800">
              {session.expired ? "Room Expired" : "Join Room"}
            </h1>
            <div className="flex items-center justify-between rounded-lg bg-gray-100 p-2">
              <span className="max-w-[14rem] truncate font-mono text-xs text-gray-500">{roomId}</span>
              <CopyButton text={roomId} />
            </div>
          </div>

          <div className="text-center">
            <div
              className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white font-mono text-2xl font-bold uppercase text-white shadow-inner ring-1 ring-gray-200"
              style={{ backgroundColor: assignedColor }}
            >
              {displayName.trim().slice(0, 1) || "?"}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Assigned Color
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleJoin()}
              placeholder="Enter your name"
              className={`input-field text-center text-sm font-mono ${
                inputError ? "border-black ring-1 ring-black" : ""
              } ${
                session.error?.code === "DUPLICATE_NAME"
                  ? "border-red-500 text-red-500 ring-2 ring-red-500"
                  : ""
              }`}
              disabled={session.expired}
            />
            {errorMessage ? (
              <p className="text-center text-sm text-red-500">{errorMessage}</p>
            ) : null}
            <button
              type="button"
              onClick={handleJoin}
              className="btn-primary"
              disabled={session.expired || session.joining || lobbyPreview?.roomFull}
            >
              {lobbyPreview?.roomFull ? "Room Full" : session.joining ? "Connecting..." : "Enter Room"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const snapshot = session.snapshot!;

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Toolbar
        activeTool={activeTool}
        activeWidth={strokeWidth}
        canUndo={snapshot.canUndo}
        canRedo={snapshot.canRedo}
        onToolChange={setActiveTool}
        onWidthChange={setStrokeWidth}
        onUndo={session.undo}
        onRedo={session.redo}
        onClearMine={session.clearMine}
        onExport={exportPng}
        onLeave={leaveRoom}
      />

      <PresencePanel
        participants={snapshot.participants}
        roomId={snapshot.roomId}
        selfClientId={clientId}
        status={session.status}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onContextMenu={(event) => event.preventDefault()}
        {...canvasProps}
      />

      {textDraft ? (
        <form
          className="fixed z-50"
          style={{ left: textDraft.x, top: textDraft.y }}
          onSubmit={(event) => {
            event.preventDefault();
            commitTextDraft();
          }}
        >
          <input
            autoFocus
            type="text"
            value={textDraft.value}
            onChange={(event) =>
              setTextDraft((current) =>
                current
                  ? {
                      ...current,
                      value: event.target.value
                    }
                  : current
              )
            }
            onBlur={commitTextDraft}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setTextDraft(null);
              }
            }}
            className="min-w-40 rounded-md border-2 border-black bg-white px-2 py-1 font-semibold shadow-lg outline-none"
            style={{ color: assignedColor, fontSize: textDraft.fontSize }}
            maxLength={240}
          />
        </form>
      ) : null}

      <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-400 shadow">
        {snapshot.items.length} Items
      </div>

      {session.status === "reconnecting" ? (
        <div className="surface-panel fixed bottom-4 right-4 z-50 rounded-full px-4 py-2 text-sm text-gray-500">
          Reconnecting...
        </div>
      ) : null}
    </main>
  );
}
