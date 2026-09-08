import { readFileSync } from "node:fs";

import { defineConfig } from "tsup";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  define: { __CMSSY_CORE_VERSION__: JSON.stringify(version) },
  entry: [
    "src/index.ts",
    "src/internal.ts",
    "src/internal/locale.ts",
    "src/testing.ts",
    "src/preflight.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
