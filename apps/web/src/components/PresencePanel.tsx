import type { Participant, RoomStatus } from "@collaborate/contracts";

import { CopyButton } from "./CopyButton";
import { ConnectionBadge } from "./ConnectionBadge";

type PresencePanelProps = {
  participants: Participant[];
  roomId: string;
  selfClientId: string;
  status: RoomStatus["status"];
};

export function PresencePanel({
  participants,
  roomId,
  selfClientId,
  status
}: PresencePanelProps) {
  return (
    <aside className="surface-panel fixed left-4 top-4 z-40 w-[16rem] rounded-xl bg-white/92 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
          Online ({participants.length})
        </h2>
        <ConnectionBadge status={status} />
      </div>

      <div className="mt-3 flex max-h-52 flex-col gap-2 overflow-y-auto">
        {participants.map((participant) => (
          <div key={participant.clientId} className="flex items-center gap-3 text-sm text-gray-700">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: participant.color }}
            />
            <span className="truncate">
              {participant.displayName}
              {participant.clientId === selfClientId ? " (You)" : ""}
            </span>
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
