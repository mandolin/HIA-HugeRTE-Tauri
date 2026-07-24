import { defineConfig } from "vitest/config";

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  test: { environment: "node", include: ["tests/**/*.test.ts", "src/**/*.test.ts"] }
});
