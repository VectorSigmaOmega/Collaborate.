import type { RoomStatus } from "@collaborate/contracts";

const statusCopy: Record<RoomStatus["status"], string> = {
  idle: "Idle",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Offline",
  syncing: "Syncing"
};

const statusStyles: Record<RoomStatus["status"], string> = {
  idle: "bg-gray-100 text-gray-500",
  connecting: "bg-amber-100 text-amber-700",
  connected: "bg-emerald-100 text-emerald-700",
  reconnecting: "bg-amber-100 text-amber-700",
  disconnected: "bg-gray-200 text-gray-500",
  syncing: "bg-blue-100 text-blue-700"
};

export function ConnectionBadge({ status }: { status: RoomStatus["status"] }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${statusStyles[status]}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      <span>{statusCopy[status]}</span>
    </div>
  );
}
