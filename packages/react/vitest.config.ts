import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "@cmssy/react/block-error-boundary": fileURLToPath(
        new URL("./src/block-error-boundary.ts", import.meta.url),
      ),
    },
  },
});
