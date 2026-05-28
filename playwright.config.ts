import { defineConfig } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    viewport: {
      width: 1280,
      height: 800
    },
    launchOptions: {
      ...(channel ? { channel } : {}),
      ...(executablePath ? { executablePath } : {})
    }
  },
  webServer: [
    {
      command: "npm run dev --workspace @collaborate/api",
      port: 5000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "5000",
        NODE_ENV: "test",
        CLIENT_ORIGIN: "http://127.0.0.1:4173",
        ROOM_REPOSITORY: "memory",
        ROOM_STORAGE_PATH: ".data/playwright-rooms.json",
        ROOM_EMPTY_TTL_MS: "900000",
        ROOM_MAX_PARTICIPANTS: "15",
        ROOM_MAX_STROKES: "400",
        ROOM_MAX_STROKE_POINTS: "1200",
        ROOM_MAX_PAYLOAD_BYTES: "131072",
        METRICS_ENABLED: "true"
      }
    },
    {
      command: "npm run dev --workspace @collaborate/web -- --host 127.0.0.1 --port 4173",
      port: 4173,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SERVER_URL: "http://127.0.0.1:5000"
      }
    }
  ]
});
