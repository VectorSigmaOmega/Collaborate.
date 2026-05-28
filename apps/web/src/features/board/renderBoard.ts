import type { BoardItem, BoardItemInput, Point } from "@collaborate/contracts";

type RenderItem = BoardItem | (BoardItemInput & { clientId: string });

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const TEXT_LINE_HEIGHT = 1.25;

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "#d1d5db";
  for (let x = 0; x < width; x += 20) {
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function normalizeBounds(start: Point, end: Point, padding = 0): Bounds {
  return {
    minX: Math.min(start.x, end.x) - padding,
    minY: Math.min(start.y, end.y) - padding,
    maxX: Math.max(start.x, end.x) + padding,
    maxY: Math.max(start.y, end.y) + padding
  };
}

function textLines(text: string) {
  return text.split("\n").filter(Boolean);
}

function configureText(ctx: CanvasRenderingContext2D, fontSize: number) {
  ctx.font = `600 ${fontSize}px Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = "top";
}

function measureTextBounds(ctx: CanvasRenderingContext2D, item: Extract<RenderItem, { kind: "text" }>) {
  configureText(ctx, item.fontSize);
  const lines = textLines(item.text);
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width), item.fontSize);
  const height = Math.max(lines.length, 1) * item.fontSize * TEXT_LINE_HEIGHT;

  return {
    minX: item.x,
    minY: item.y,
    maxX: item.x + width,
    maxY: item.y + height
  };
}

export function getBoardItemBounds(ctx: CanvasRenderingContext2D, item: RenderItem): Bounds {
  switch (item.kind) {
    case "stroke": {
      const padding = item.width / 2;
      return item.points.reduce<Bounds>(
        (bounds, point) => ({
          minX: Math.min(bounds.minX, point.x - padding),
          minY: Math.min(bounds.minY, point.y - padding),
          maxX: Math.max(bounds.maxX, point.x + padding),
          maxY: Math.max(bounds.maxY, point.y + padding)
        }),
        {
          minX: item.points[0]?.x ?? 0,
          minY: item.points[0]?.y ?? 0,
          maxX: item.points[0]?.x ?? 0,
          maxY: item.points[0]?.y ?? 0
        }
      );
    }
    case "shape":
      return normalizeBounds(item.start, item.end, item.width / 2);
    case "text":
      return measureTextBounds(ctx, item);
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, item: Extract<RenderItem, { kind: "stroke" }>) {
  if (item.points.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = item.width;
  ctx.globalCompositeOperation = item.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = item.tool === "eraser" ? "rgba(0,0,0,1)" : item.color;
  ctx.fillStyle = item.tool === "eraser" ? "rgba(0,0,0,1)" : item.color;

  if (item.points.length === 1) {
    const [point] = item.points;
    ctx.beginPath();
    ctx.arc(point.x, point.y, item.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(item.points[0].x, item.points[0].y);

  for (const point of item.points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }

  ctx.stroke();
  ctx.restore();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, start: Point, end: Point, width: number) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = Math.max(12, width * 3);

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawShape(ctx: CanvasRenderingContext2D, item: Extract<RenderItem, { kind: "shape" }>) {
  const bounds = normalizeBounds(item.start, item.end);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = item.width;
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;

  if (item.shape === "rectangle") {
    ctx.strokeRect(bounds.minX, bounds.minY, width, height);
  } else if (item.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      bounds.minX + width / 2,
      bounds.minY + height / 2,
      Math.abs(width / 2),
      Math.abs(height / 2),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(item.start.x, item.start.y);
    ctx.lineTo(item.end.x, item.end.y);
    ctx.stroke();
    drawArrowHead(ctx, item.start, item.end, item.width);
  }

  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, item: Extract<RenderItem, { kind: "text" }>) {
  ctx.save();
  configureText(ctx, item.fontSize);
  ctx.fillStyle = item.color;

  textLines(item.text).forEach((line, index) => {
    ctx.fillText(line, item.x, item.y + index * item.fontSize * TEXT_LINE_HEIGHT);
  });

  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, item: RenderItem) {
  if (item.kind === "stroke") {
    drawStroke(ctx, item);
  } else if (item.kind === "shape") {
    drawShape(ctx, item);
  } else {
    drawText(ctx, item);
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, item: RenderItem) {
  const bounds = getBoardItemBounds(ctx, item);
  const padding = 6;

  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#111827";
  ctx.strokeRect(
    bounds.minX - padding,
    bounds.minY - padding,
    bounds.maxX - bounds.minX + padding * 2,
    bounds.maxY - bounds.minY + padding * 2
  );
  ctx.restore();
}

function expandBounds(bounds: Bounds, padding: number): Bounds {
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding
  };
}

export function pointInBounds(point: Point, bounds: Bounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

export function pointInExpandedBoardItemBounds(
  ctx: CanvasRenderingContext2D,
  item: RenderItem,
  point: Point,
  padding = 12
) {
  return pointInBounds(point, expandBounds(getBoardItemBounds(ctx, item), padding));
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function hitTestStroke(item: Extract<RenderItem, { kind: "stroke" }>, point: Point) {
  const tolerance = Math.max(8, item.width / 2 + 4);

  if (item.points.length === 1) {
    return Math.hypot(point.x - item.points[0].x, point.y - item.points[0].y) <= tolerance;
  }

  for (let index = 1; index < item.points.length; index += 1) {
    if (distanceToSegment(point, item.points[index - 1], item.points[index]) <= tolerance) {
      return true;
    }
  }

  return false;
}

function hitTestShape(ctx: CanvasRenderingContext2D, item: Extract<RenderItem, { kind: "shape" }>, point: Point) {
  const tolerance = Math.max(8, item.width / 2 + 4);

  if (item.shape === "arrow") {
    return distanceToSegment(point, item.start, item.end) <= tolerance;
  }

  const bounds = normalizeBounds(item.start, item.end);
  const expandedBounds = expandBounds(bounds, tolerance);
  if (!pointInBounds(point, expandedBounds)) {
    return false;
  }

  if (item.shape === "rectangle") {
    const top = distanceToSegment(point, { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY });
    const right = distanceToSegment(point, { x: bounds.maxX, y: bounds.minY }, { x: bounds.maxX, y: bounds.maxY });
    const bottom = distanceToSegment(point, { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY });
    const left = distanceToSegment(point, { x: bounds.minX, y: bounds.maxY }, { x: bounds.minX, y: bounds.minY });

    return Math.min(top, right, bottom, left) <= tolerance;
  }

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const centerX = bounds.minX + width / 2;
  const centerY = bounds.minY + height / 2;
  const radiusX = width / 2;
  const radiusY = height / 2;
  const outerRadiusX = radiusX + tolerance;
  const outerRadiusY = radiusY + tolerance;
  const innerRadiusX = Math.max(1, radiusX - tolerance);
  const innerRadiusY = Math.max(1, radiusY - tolerance);
  const outerNormalized =
    ((point.x - centerX) * (point.x - centerX)) / ((width / 2) * (width / 2)) +
    ((point.y - centerY) * (point.y - centerY)) / ((height / 2) * (height / 2));
  const innerNormalized =
    ((point.x - centerX) * (point.x - centerX)) / (innerRadiusX * innerRadiusX) +
    ((point.y - centerY) * (point.y - centerY)) / (innerRadiusY * innerRadiusY);

  return (
    ((point.x - centerX) * (point.x - centerX)) / (outerRadiusX * outerRadiusX) +
      ((point.y - centerY) * (point.y - centerY)) / (outerRadiusY * outerRadiusY) <=
      1 &&
    (outerNormalized >= 1 || innerNormalized >= 1)
  );
}

export function hitTestBoardItem(ctx: CanvasRenderingContext2D, item: RenderItem, point: Point) {
  if (item.kind === "stroke" && item.tool === "eraser") {
    return false;
  }

  if (item.kind === "stroke") {
    return hitTestStroke(item, point);
  }

  if (item.kind === "shape") {
    return hitTestShape(ctx, item, point);
  }

  return pointInBounds(point, expandBounds(getBoardItemBounds(ctx, item), 6));
}

export function renderBoardScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: BoardItem[],
  previewItems: BoardItem[],
  draftItem: RenderItem | null,
  selectedItemId: string | null = null,
  includeGrid = true
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8f9fa";
  ctx.fillRect(0, 0, width, height);

  if (includeGrid) {
    drawGrid(ctx, width, height);
  }

  for (const item of items) {
    drawItem(ctx, item);
  }

  for (const item of previewItems) {
    drawItem(ctx, item);
  }

  if (draftItem) {
    drawItem(ctx, draftItem);
  }

  const selectedItem = [...items, draftItem].find((item) => item?.id === selectedItemId);
  if (selectedItem) {
    drawSelection(ctx, selectedItem);
  }
}
