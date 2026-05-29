import {
  ArrowUpRight,
  Circle,
  Download,
  Eraser,
  LogOut,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2
} from "lucide-react";
import type { ComponentType } from "react";

import type { BoardTool } from "@collaborate/contracts";

type ToolbarProps = {
  activeTool: BoardTool;
  activeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: BoardTool) => void;
  onWidthChange: (value: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearMine: () => void;
  onExport: () => void;
  onLeave: () => void;
};

const tools: Array<{
  tool: BoardTool;
  title: string;
  icon: ComponentType<{ size?: number }>;
}> = [
  { tool: "select", title: "Select and move", icon: MousePointer2 },
  { tool: "pen", title: "Pen", icon: Pencil },
  { tool: "eraser", title: "Eraser", icon: Eraser },
  { tool: "rectangle", title: "Rectangle", icon: Square },
  { tool: "ellipse", title: "Ellipse", icon: Circle },
  { tool: "arrow", title: "Arrow", icon: ArrowUpRight },
  { tool: "text", title: "Text", icon: Type }
];

export function Toolbar({
  activeTool,
  activeWidth,
  canUndo,
  canRedo,
  onToolChange,
  onWidthChange,
  onUndo,
  onRedo,
  onClearMine,
  onExport,
  onLeave
}: ToolbarProps) {
  return (
    <div className="surface-panel fixed left-1/2 top-4 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-full px-3.5 py-1">
      <div className="flex items-center gap-0.5">
        {tools.map(({ tool, title, icon: Icon }) => (
          <button
            key={tool}
            type="button"
            className={`icon-button ${activeTool === tool ? "bg-gray-100 text-black" : ""}`}
            onClick={() => onToolChange(tool)}
            title={title}
            aria-pressed={activeTool === tool}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      <span className="toolbar-divider" />

      <input
        type="range"
        min={2}
        max={18}
        step={1}
        value={activeWidth}
        onChange={(event) => onWidthChange(Number(event.target.value))}
        title="Stroke width"
        className="w-20 shrink-0 accent-black"
      />

      <span className="toolbar-divider" />

      <button type="button" className="icon-button" onClick={onUndo} disabled={!canUndo} title="Undo">
        <Undo2 size={18} />
      </button>
      <button type="button" className="icon-button" onClick={onRedo} disabled={!canRedo} title="Redo">
        <Redo2 size={18} />
      </button>

      <span className="toolbar-divider" />

      <button
        type="button"
        className="icon-button icon-button-destructive"
        onClick={onClearMine}
        title="Clear my content"
      >
        <Trash2 size={18} />
      </button>
      <button type="button" className="icon-button" onClick={onExport} title="Export PNG">
        <Download size={18} />
      </button>
      <button type="button" className="icon-button" onClick={onLeave} title="Leave room">
        <LogOut size={18} />
      </button>
    </div>
  );
}
