import type { BoardItem, BoardItemInput, Point } from "./schema.js";

export type BoardItemBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const TEXT_LINE_HEIGHT = 1.25;

export function translatePoint(point: Point, delta: Point): Point {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y
  };
}

export function getBoardItemAnchor(item: BoardItem | BoardItemInput): Point {
  switch (item.kind) {
    case "stroke":
      return item.points[0] ?? { x: 0, y: 0 };
    case "shape":
      return item.start;
    case "text":
      return { x: item.x, y: item.y };
  }
}

export function getApproxBoardItemBounds(item: BoardItem | BoardItemInput): BoardItemBounds {
  switch (item.kind) {
    case "stroke": {
      const padding = item.width / 2;
      return item.points.reduce<BoardItemBounds>(
        (bounds, point) => ({
          minX: Math.min(bounds.minX, point.x - padding),
          minY: Math.min(bounds.minY, point.y - padding),
          maxX: Math.max(bounds.maxX, point.x + padding),
          maxY: Math.max(bounds.maxY, point.y + padding)
        }),
        {
          minX: (item.points[0]?.x ?? 0) - padding,
          minY: (item.points[0]?.y ?? 0) - padding,
          maxX: (item.points[0]?.x ?? 0) + padding,
          maxY: (item.points[0]?.y ?? 0) + padding
        }
      );
    }
    case "shape":
      return {
        minX: Math.min(item.start.x, item.end.x) - item.width / 2,
        minY: Math.min(item.start.y, item.end.y) - item.width / 2,
        maxX: Math.max(item.start.x, item.end.x) + item.width / 2,
        maxY: Math.max(item.start.y, item.end.y) + item.width / 2
      };
    case "text": {
      const lines = item.text.split("\n").filter(Boolean);
      const longestLineLength = Math.max(...lines.map((line) => line.length), 1);
      const width = Math.max(item.fontSize, longestLineLength * item.fontSize * 0.62);
      const height = Math.max(lines.length, 1) * item.fontSize * TEXT_LINE_HEIGHT;
      return {
        minX: item.x,
        minY: item.y,
        maxX: item.x + width,
        maxY: item.y + height
      };
    }
  }
}

export function translateBoardItem<T extends BoardItem | BoardItemInput>(item: T, delta: Point): T {
  switch (item.kind) {
    case "stroke":
      return {
        ...item,
        anchor: item.anchor ? translatePoint(item.anchor, delta) : item.anchor,
        points: item.points.map((point) => translatePoint(point, delta))
      } as T;
    case "shape":
      return {
        ...item,
        start: translatePoint(item.start, delta),
        end: translatePoint(item.end, delta)
      } as T;
    case "text":
      return {
        ...item,
        x: item.x + delta.x,
        y: item.y + delta.y
      } as T;
  }
}
