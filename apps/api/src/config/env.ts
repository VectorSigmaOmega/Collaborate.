import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CLIENT_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  ROOM_REPOSITORY: z.enum(["memory", "file"]).optional(),
  ROOM_STORAGE_PATH: z.string().min(1).optional(),
  ROOM_EMPTY_TTL_MS: z.coerce.number().int().min(60_000).default(900_000),
  ROOM_MAX_PARTICIPANTS: z.coerce.number().int().min(2).max(50).default(15),
  ROOM_MAX_STROKES: z.coerce.number().int().min(10).max(2000).default(400),
  ROOM_MAX_STROKE_POINTS: z.coerce.number().int().min(2).max(10_000).default(1200),
  ROOM_MAX_PAYLOAD_BYTES: z.coerce.number().int().min(1024).max(1_048_576).default(131_072),
  METRICS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false")
});

type ParsedEnv = z.infer<typeof envSchema>;

export type AppConfig = Omit<ParsedEnv, "ROOM_REPOSITORY" | "ROOM_STORAGE_PATH"> & {
  ROOM_REPOSITORY: "memory" | "file";
  ROOM_STORAGE_PATH: string;
};

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(source);

  return {
    ...parsed,
    ROOM_REPOSITORY: parsed.ROOM_REPOSITORY ?? (parsed.NODE_ENV === "test" ? "memory" : "file"),
    ROOM_STORAGE_PATH: parsed.ROOM_STORAGE_PATH ?? ".data/rooms.json"
  };
}
