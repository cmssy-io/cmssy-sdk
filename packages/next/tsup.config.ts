import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const CLIENT_OUTPUTS = ["dist/client.js", "dist/client.cjs"];

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/middleware.ts",
    "src/client.ts",
    "src/testing.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ["react", "react-dom", "server-only", /^next/, /^@cmssy\/(react|core)/],
  async onSuccess() {
    for (const file of CLIENT_OUTPUTS) {
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client"')) {
        await writeFile(file, `"use client";\n${code}`);
      }
    }
  },
});
