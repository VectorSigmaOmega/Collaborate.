import { MAX_DISPLAY_NAME_LENGTH, type Participant } from "@collaborate/contracts";

import { CopyButton } from "./CopyButton";

type PresencePanelProps = {
  participants: Participant[];
  roomId: string;
  selfClientId: string;
};

export function PresencePanel({
  participants,
  roomId,
  selfClientId
}: PresencePanelProps) {
  return (
    <aside className="surface-panel fixed left-4 top-4 z-40 w-[16rem] rounded-xl bg-white/92 p-4 backdrop-blur-sm">
      <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
        Online ({participants.length})
      </h2>

      <div className="mt-3 flex max-h-52 flex-col gap-2 overflow-y-auto">
        {participants.map((participant) => (
          <div
            key={participant.clientId}
            className="flex min-w-0 items-center gap-3 text-sm text-gray-700"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: participant.color }}
            />
            <div className="flex min-w-0 items-center gap-1">
              <span
                className="block truncate"
                style={{ maxWidth: `${MAX_DISPLAY_NAME_LENGTH}ch` }}
                title={participant.displayName}
              >
                {participant.displayName}
              </span>
              {participant.clientId === selfClientId ? (
                <span className="shrink-0 text-gray-400">(You)</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Room ID</span>
        <div className="flex items-center gap-2">
          <span className="max-w-[8rem] truncate font-mono text-xs text-gray-500">{roomId}</span>
          <CopyButton text={roomId} />
        </div>
      </div>
    </aside>
  );
}
