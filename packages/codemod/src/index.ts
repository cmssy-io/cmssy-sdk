import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { transform } from "./v5";

const SKIP = new Set(["node_modules", "dist", "build", "out", "coverage"]);
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

// Hidden directories are skipped wholesale: .next holds build output, and
// .worktrees holds OTHER checkouts of the same repo - rewriting those would
// quietly edit branches the developer is not even on.
function skipDirectory(name: string): boolean {
  return name.startsWith(".") || SKIP.has(name);
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return skipDirectory(entry.name) ? [] : sourceFiles(path);
      }
      return EXTENSIONS.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
    }),
  );
  return files.flat();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const version = args[0];
  if (version !== "v5") {
    console.error("usage: cmssy-codemod v5 [path] [--dry]");
    process.exitCode = 1;
    return;
  }

  const dry = args.includes("--dry");
  const target = resolve(
    args.find((a) => !a.startsWith("-") && a !== "v5") ?? ".",
  );

  const files = await sourceFiles(target);
  const touched: string[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const { code, changed } = transform(source);
    if (!changed) continue;
    touched.push(file);
    if (!dry) await writeFile(file, code);
  }

  if (touched.length === 0) {
    console.log("cmssy: nothing to migrate - no 4.x imports found.");
    return;
  }

  console.log(
    `cmssy: ${dry ? "would rewrite" : "rewrote"} ${touched.length} file(s):`,
  );
  for (const file of touched) {
    console.log(`  ${file.slice(target.length + 1)}`);
  }
  console.log(
    "\nThe imports moved; the wiring did not. Run your build, then the editor\n" +
      "smoke test - a site whose editor is dead still builds:\n" +
      "  https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/testing.md",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
