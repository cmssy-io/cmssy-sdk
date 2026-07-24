import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/middleware.ts",
    "src/testing.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: [
    "react",
    "react-dom",
    "server-only",
    /^next/,
    /^@cmssy\/(react|core)/,
  ],
});
