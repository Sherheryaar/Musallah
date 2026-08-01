import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" -> "./src/*" path alias.
    alias: { "@": resolve(root, "src") },
  },
  test: {
    // scripts/ is included because the data-pipeline parsers there decide
    // what prayer times users see; they are unit-tested like app code.
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
