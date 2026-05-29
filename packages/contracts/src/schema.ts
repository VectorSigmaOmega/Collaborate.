import { z } from "zod";

export const MAX_DISPLAY_NAME_LENGTH = 20;

const colorSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(
    /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|hsl[a]?\([^)]*\)|rgb[a]?\([^)]*\)|[a-zA-Z]+)$/,
    "Invalid color value"
  );

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

export const strokeToolSchema = z.enum(["pen", "eraser"]);
export const shapeToolSchema = z.enum(["rectangle", "ellipse", "arrow"]);
export const boardToolSchema = z.enum([
  "select",
  "pen",
  "eraser",
  "rectangle",
  "ellipse",
  "arrow",
  "text"
]);

export const strokeInputSchema = z.object({
  kind: z.literal("stroke"),
  id: z.string().min(1).max(64),
  actionId: z.string().min(1).max(64).optional(),
  tool: strokeToolSchema,
  color: colorSchema,
  width: z.number().int().min(1).max(32),
  points: z.array(pointSchema).min(1).max(1200),
  maskForItemId: z.string().min(1).max(64).optional(),
  anchor: pointSchema.optional()
});

export const shapeInputSchema = z.object({
  kind: z.literal("shape"),
  id: z.string().min(1).max(64),
  actionId: z.string().min(1).max(64).optional(),
  shape: shapeToolSchema,
  color: colorSchema,
  width: z.number().int().min(1).max(32),
  start: pointSchema,
  end: pointSchema
});

export const textInputSchema = z.object({
  kind: z.literal("text"),
  id: z.string().min(1).max(64),
  actionId: z.string().min(1).max(64).optional(),
  color: colorSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  text: z.string().trim().min(1).max(240),
  fontSize: z.number().int().min(12).max(48)
});

export const boardItemInputSchema = z.discriminatedUnion("kind", [
  strokeInputSchema,
  shapeInputSchema,
  textInputSchema
]);

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(
    MAX_DISPLAY_NAME_LENGTH,
    `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`
  );

export const participantSchema = z.object({
  clientId: z.string().min(1).max(64),
  displayName: displayNameSchema,
  color: colorSchema,
  connected: z.boolean()
});

export const roomJoinPayloadSchema = z.object({
  roomId: z
    .string()
    .trim()
    .min(3)
    .max(128)
    .regex(/^[a-zA-Z0-9-]+$/, "Room IDs must be URL-safe"),
  clientId: z.string().min(1).max(64),
  displayName: displayNameSchema,
  preferredColor: colorSchema.optional()
});

export const boardStrokeSchema = strokeInputSchema.extend({
  clientId: z.string().min(1).max(64)
});

export const boardShapeSchema = shapeInputSchema.extend({
  clientId: z.string().min(1).max(64)
});

export const boardTextSchema = textInputSchema.extend({
  clientId: z.string().min(1).max(64)
});

export const boardItemSchema = z.discriminatedUnion("kind", [
  boardStrokeSchema,
  boardShapeSchema,
  boardTextSchema
]);

export const boardItemMovePayloadSchema = z.object({
  id: z.string().min(1).max(64),
  delta: pointSchema
});

export const boardSnapshotSchema = z.object({
  roomId: z.string().min(1),
  items: z.array(boardItemSchema),
  participants: z.array(participantSchema),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  expiresAt: z.number().int().nullable()
});

export const roomStatusSchema = z.object({
  status: z.enum(["idle", "connecting", "connected", "reconnecting", "disconnected", "syncing"])
});

export const roomErrorCodeSchema = z.enum([
  "DUPLICATE_NAME",
  "ROOM_FULL",
  "ROOM_EXPIRED",
  "INVALID_PAYLOAD",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "UNKNOWN"
]);

export const roomErrorSchema = z.object({
  code: roomErrorCodeSchema,
  message: z.string().min(1)
});

export const boardCapabilitiesSchema = z.object({
  canUndo: z.boolean(),
  canRedo: z.boolean()
});

export type Point = z.infer<typeof pointSchema>;
export type StrokeTool = z.infer<typeof strokeToolSchema>;
export type ShapeTool = z.infer<typeof shapeToolSchema>;
export type BoardTool = z.infer<typeof boardToolSchema>;
export type StrokeInput = z.infer<typeof strokeInputSchema>;
export type ShapeInput = z.infer<typeof shapeInputSchema>;
export type TextInput = z.infer<typeof textInputSchema>;
export type BoardItemInput = z.infer<typeof boardItemInputSchema>;
export type BoardStroke = z.infer<typeof boardStrokeSchema>;
export type BoardShape = z.infer<typeof boardShapeSchema>;
export type BoardText = z.infer<typeof boardTextSchema>;
export type BoardItem = z.infer<typeof boardItemSchema>;
export type BoardItemMovePayload = z.infer<typeof boardItemMovePayloadSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type RoomJoinPayload = z.infer<typeof roomJoinPayloadSchema>;
export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type RoomErrorCode = z.infer<typeof roomErrorCodeSchema>;
export type RoomErrorPayload = z.infer<typeof roomErrorSchema>;
export type BoardCapabilities = z.infer<typeof boardCapabilitiesSchema>;
