import type { BoardItem, BoardItemInput, Point } from "./schema.js";

export function translatePoint(point: Point, delta: Point): Point {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y
  };
}

export function translateBoardItem<T extends BoardItem | BoardItemInput>(item: T, delta: Point): T {
  switch (item.kind) {
    case "stroke":
      return {
        ...item,
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
