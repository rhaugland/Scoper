import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@scoper/db": resolve(__dirname, "../../packages/db/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
