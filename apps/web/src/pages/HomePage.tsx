import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createRoomId } from "../lib/session";

export function HomePage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [inputError, setInputError] = useState(false);
  const placeholderId = useMemo(() => createRoomId().slice(0, 8), []);

  const createRoom = () => {
    navigate(`/${createRoomId()}`);
  };

  const joinRoom = () => {
    if (!roomId.trim()) {
      setInputError(true);
      window.setTimeout(() => setInputError(false), 200);
      return;
    }

    navigate(`/${roomId.trim()}`);
  };

  return (
    <main className="flex h-full items-center justify-center px-6">
      <section
        className="surface-panel relative flex h-[30rem] w-full max-w-sm flex-col rounded-xl p-10"
        aria-label="Create or join a room"
      >
        <div className="mt-12 text-center">
          <h1 className="mb-1 text-5xl font-black tracking-tight">Collaborate.</h1>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
            Real-time Shared Whiteboard
          </p>
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-5">
          <button type="button" onClick={createRoom} className="btn-primary">
            New Session
          </button>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-gray-200" />
            <span className="mx-4 text-[10px] font-bold uppercase tracking-[0.28em] text-gray-300">
              Or Join
            </span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && joinRoom()}
              placeholder={`Paste Room ID (${placeholderId})`}
              className={`input-field text-center font-mono text-sm ${
                inputError ? "border-black ring-1 ring-black" : ""
              }`}
            />
            <button type="button" onClick={joinRoom} className="btn-secondary">
              Join Session
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
