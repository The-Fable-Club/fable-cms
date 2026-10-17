import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live tests talk to the real project; they only run through `npm run test:live`.
    exclude: process.env.LIVE === "1" ? ["node_modules/**"] : ["node_modules/**", "tests/live/**"],
    testTimeout: 30_000,
  },
});
