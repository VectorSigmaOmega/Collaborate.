import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  translateBoardItem,
  type BoardItem,
  type BoardItemInput,
  type BoardItemPreviewInput,
  type BoardItemMovePayload,
  type BoardTool,
  type Point,
  type ShapeTool
} from "@collaborate/contracts";

import { DEFAULT_STROKE_WIDTH } from "../../lib/constants";
import {
  hitTestBoardItem,
  pointInExpandedBoardItemBounds,
  renderBoardScene
} from "./renderBoard";

export type TextDraft = {
  id: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
};

type DraftItem = BoardItemInput & { clientId: string };

type MoveSession = {
  itemId: string;
  start: Point;
  total: Point;
};

type BoardCanvasOptions = {
  enabled: boolean;
  clientId: string;
  activeTool: BoardTool;
  activeColor: string;
  activeWidth: number;
  items: BoardItem[];
  previewItems: BoardItem[];
  onPreviewItem: (item: BoardItemPreviewInput) => void;
  onCommitItem: (item: BoardItemInput) => void;
  onMoveItem: (payload: BoardItemMovePayload) => void;
  onStartTextDraft: (draft: TextDraft) => void;
};

const SHAPE_TOOLS = new Set<BoardTool>(["rectangle", "ellipse", "arrow"]);

function isShapeTool(tool: BoardTool): tool is ShapeTool {
  return SHAPE_TOOLS.has(tool);
}

function distance(start: Point, end: Point) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function moveDeltaIsVisible(delta: Point) {
  return Math.abs(delta.x) >= 0.5 || Math.abs(delta.y) >= 0.5;
}

function isSelectableItem(item: BoardItem) {
  return !(item.kind === "stroke" && item.tool === "eraser");
}

export function useBoardCanvas({
  enabled,
  clientId,
  activeTool,
  activeColor,
  activeWidth = DEFAULT_STROKE_WIDTH,
  items,
  previewItems,
  onPreviewItem,
  onCommitItem,
  onMoveItem,
  onStartTextDraft
}: BoardCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftItemRef = useRef<DraftItem | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const previewFlushRef = useRef<number>(0);
  const previewedStrokePointCountRef = useRef<Map<string, number>>(new Map());
  const renderNowRef = useRef<(() => void) | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const moveSessionRef = useRef<MoveSession | null>(null);
  const textIntentRef = useRef<TextDraft | null>(null);
  const selectedItemIdRef = useRef<string | null>(null);
  const [selectedItemId, setSelectedItemIdState] = useState<string | null>(null);

  const setSelectedItemId = useCallback((itemId: string | null) => {
    selectedItemIdRef.current = itemId;
    setSelectedItemIdState(itemId);
  }, []);

  const renderNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const moveSession = moveSessionRef.current;
    const renderedItems =
      moveSession && moveDeltaIsVisible(moveSession.total)
        ? items.map((item) =>
            item.id === moveSession.itemId ? translateBoardItem(item, moveSession.total) : item
          )
        : items;

    renderBoardScene(
      context,
      canvas.width / window.devicePixelRatio,
      canvas.height / window.devicePixelRatio,
      renderedItems,
      previewItems,
      draftItemRef.current,
      selectedItemIdRef.current,
      true
    );
  }, [items, previewItems]);

  useLayoutEffect(() => {
    renderNowRef.current = renderNow;
  }, [renderNow]);

  const requestRender = useCallback(() => {
    if (renderFrameRef.current !== null) {
      return;
    }

    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      renderNowRef.current?.();
    });
  }, []);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * pixelRatio);
    canvas.height = Math.floor(window.innerHeight * pixelRatio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    renderNow();
  }, [renderNow]);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener("resize", syncCanvasSize);
    return () => window.removeEventListener("resize", syncCanvasSize);
  }, [syncCanvasSize]);

  useEffect(() => {
    requestRender();
  }, [requestRender, selectedItemId]);

  useEffect(
    () => () => {
      if (renderFrameRef.current !== null) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    },
    []
  );

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const getCanvasContext = () => {
    const canvas = canvasRef.current;
    return canvas?.getContext("2d") ?? null;
  };

  const getItemAtPoint = (point: Point) => {
    const context = getCanvasContext();
    if (!context) {
      return null;
    }

    return [...items].reverse().find((item) => isSelectableItem(item) && hitTestBoardItem(context, item, point)) ?? null;
  };

  const getSelectedItemAtPoint = (point: Point) => {
    const context = getCanvasContext();
    if (!context || !selectedItemIdRef.current) {
      return null;
    }

    const selectedItem = items.find((item) => item.id === selectedItemIdRef.current);
    if (!selectedItem || !isSelectableItem(selectedItem)) {
      return null;
    }

    const dragPadding = selectedItem.kind === "shape" ? 6 : 12;
    return pointInExpandedBoardItemBounds(context, selectedItem, point, dragPadding)
      ? selectedItem
      : null;
  };

  const toInputItem = (item: DraftItem): BoardItemInput => {
    if (item.kind === "stroke") {
      return {
        kind: "stroke",
        id: item.id,
        tool: item.tool,
        color: item.color,
        width: item.width,
        points: item.points
      };
    }

    if (item.kind === "shape") {
      return {
        kind: "shape",
        id: item.id,
        shape: item.shape,
        color: item.color,
        width: item.width,
        start: item.start,
        end: item.end
      };
    }

    return {
      kind: "text",
      id: item.id,
      color: item.color,
      x: item.x,
      y: item.y,
      text: item.text,
      fontSize: item.fontSize
    };
  };

  const toPreviewItem = (item: DraftItem): BoardItemPreviewInput | null => {
    if (item.kind !== "stroke") {
      return toInputItem(item);
    }

    const previewedPointCount = previewedStrokePointCountRef.current.get(item.id) ?? 0;
    const points = item.points.slice(previewedPointCount);
    if (points.length === 0) {
      return null;
    }

    previewedStrokePointCountRef.current.set(item.id, item.points.length);
    return {
      kind: "stroke",
      id: item.id,
      tool: item.tool,
      color: item.color,
      width: item.width,
      points,
      append: previewedPointCount > 0
    };
  };

  const startSelection = (event: ReactPointerEvent<HTMLCanvasElement>, point: Point) => {
    const selectedItem = getSelectedItemAtPoint(point) ?? getItemAtPoint(point);
    setSelectedItemId(selectedItem?.id ?? null);

    if (!selectedItem || selectedItem.clientId !== clientId) {
      requestRender();
      return;
    }

    activePointerIdRef.current = event.pointerId;
    moveSessionRef.current = {
      itemId: selectedItem.id,
      start: point,
      total: { x: 0, y: 0 }
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    requestRender();
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>, point: Point) => {
    activePointerIdRef.current = event.pointerId;

    if (isShapeTool(activeTool)) {
      draftItemRef.current = {
        kind: "shape",
        id: crypto.randomUUID(),
        clientId,
        shape: activeTool,
        color: activeColor,
        width: activeWidth,
        start: point,
        end: point
      };
    } else {
      draftItemRef.current = {
        kind: "stroke",
        id: crypto.randomUUID(),
        clientId,
        tool: activeTool === "eraser" ? "eraser" : "pen",
        color: activeColor,
        width: activeWidth,
        points: [point]
      };
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    requestRender();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!enabled || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    const point = getPoint(event);

    if (activeTool === "text") {
      activePointerIdRef.current = event.pointerId;
      textIntentRef.current = {
        id: crypto.randomUUID(),
        x: point.x,
        y: point.y,
        color: activeColor,
        fontSize: Math.max(18, activeWidth + 12)
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (activeTool === "select") {
      startSelection(event, point);
      return;
    }

    startDrawing(event, point);
  };

  const flushPreview = (draftItem: DraftItem) => {
    const now = performance.now();
    if (now - previewFlushRef.current <= 40) {
      return;
    }

    previewFlushRef.current = now;
    const previewItem = toPreviewItem(draftItem);
    if (previewItem) {
      onPreviewItem(previewItem);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!enabled || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = getPoint(event);
    if (textIntentRef.current) {
      return;
    }

    const moveSession = moveSessionRef.current;
    if (moveSession) {
      moveSession.total = {
        x: point.x - moveSession.start.x,
        y: point.y - moveSession.start.y
      };
      requestRender();
      return;
    }

    const draftItem = draftItemRef.current;
    if (!draftItem) {
      return;
    }

    if (draftItem.kind === "stroke") {
      const lastPoint = draftItem.points[draftItem.points.length - 1];
      if (Math.abs(lastPoint.x - point.x) < 0.5 && Math.abs(lastPoint.y - point.y) < 0.5) {
        return;
      }
      draftItem.points.push(point);
    } else if (draftItem.kind === "shape") {
      draftItem.end = point;
    }

    requestRender();
    flushPreview(draftItem);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const textIntent = textIntentRef.current;
    if (textIntent) {
      onStartTextDraft(textIntent);
      textIntentRef.current = null;
      activePointerIdRef.current = null;
      requestRender();
      return;
    }

    const moveSession = moveSessionRef.current;
    if (moveSession) {
      if (moveDeltaIsVisible(moveSession.total)) {
        onMoveItem({
          id: moveSession.itemId,
          delta: moveSession.total
        });
      }

      moveSessionRef.current = null;
      activePointerIdRef.current = null;
      requestRender();
      return;
    }

    const draftItem = draftItemRef.current;
    if (draftItem) {
      const shouldCommit =
        draftItem.kind === "stroke"
          ? draftItem.points.length >= 2
          : draftItem.kind === "shape" && distance(draftItem.start, draftItem.end) >= 4;

      if (shouldCommit) {
        onCommitItem(toInputItem(draftItem));
        setSelectedItemId(isSelectableItem(draftItem) ? draftItem.id : null);
      }
      previewedStrokePointCountRef.current.delete(draftItem.id);
    }

    draftItemRef.current = null;
    activePointerIdRef.current = null;
    requestRender();
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    if (draftItemRef.current) {
      previewedStrokePointCountRef.current.delete(draftItemRef.current.id);
    }
    draftItemRef.current = null;
    moveSessionRef.current = null;
    textIntentRef.current = null;
    activePointerIdRef.current = null;
    requestRender();
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const context = exportCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    renderBoardScene(
      context,
      exportCanvas.width / window.devicePixelRatio,
      exportCanvas.height / window.devicePixelRatio,
      items,
      [],
      null,
      null,
      true
    );

    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = "collaborate-board.png";
    link.click();
  };

  return {
    canvasRef,
    canvasProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: cancelPointer
    },
    selectedItemId,
    exportPng
  };
}
