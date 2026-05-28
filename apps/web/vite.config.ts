import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@collaborate/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts")
    }
  },
  test: {
    environment: "node"
  }
});
