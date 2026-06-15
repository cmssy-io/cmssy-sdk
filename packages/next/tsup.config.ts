import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const CLIENT_OUTPUTS = ["dist/client.js", "dist/client.cjs"];

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ["react", "react-dom", /^next/, /^@cmssy\/react/],
  async onSuccess() {
    for (const file of CLIENT_OUTPUTS) {
      const code = await readFile(file, "utf8");
      if (!code.startsWith('"use client"')) {
        await writeFile(file, `"use client";\n${code}`);
      }
    }
  },
});
