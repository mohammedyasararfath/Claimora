import { defineConfig } from "vitest/config";
import path from "path";

// Separate from vitest.config.ts (unit tests, jsdom, fast, no network) —
// these hit real deployed edge functions and a real Anthropic model, so they
// need Node's fetch/network, run slower, and are opt-in via `npm run
// test:evals` rather than part of the default `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/evals/**/*.eval.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
