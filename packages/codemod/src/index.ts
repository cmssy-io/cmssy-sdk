import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { transform as transformV5 } from "./v5";
import { transform as transformV7 } from "./v7";
import { transform as transformV8 } from "./v8";
import { transform as transformV9 } from "./v9";
import { transform as transformV12 } from "./v12";
import { transform as transformV15 } from "./v15";

const TRANSFORMS = {
  v5: transformV5,
  v7: transformV7,
  v8: transformV8,
  v9: transformV9,
  v12: transformV12,
  v15: transformV15,
};
type Version = keyof typeof TRANSFORMS;

const PREVIOUS_MAJOR: Record<Version, string> = {
  v5: "4.x",
  v7: "6.x",
  v8: "7.x",
  v9: "8.x",
  v12: "11.x",
  v15: "14.x",
};

const MIGRATION_GUIDE: Record<Version, string> = {
  v5: "https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/migrations/v4-to-v5.md",
  v7: "https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/migrations/v4-to-v5.md",
  v8: "https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/migrations/v7-to-v8.md",
  v9: "https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/migrations/v8-to-v9.md",
  v12: "https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/migrations/v11-to-v12.md",
  v15: "https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/migrations/v14-to-v15.md",
};

const SKIP = new Set(["node_modules", "dist", "build", "out", "coverage"]);
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

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
  const version = args[0] as Version;
  const transform = TRANSFORMS[version];
  if (!transform) {
    console.error("usage: cmssy-codemod v5|v7|v8|v9|v12|v15 [path] [--dry]");
    process.exitCode = 1;
    return;
  }

  const dry = args.includes("--dry");
  const target = resolve(
    args.find((a) => !a.startsWith("-") && !(a in TRANSFORMS)) ?? ".",
  );

  const files = await sourceFiles(target);
  const touched: string[] = [];
  const manual: Array<{ file: string; notes: string[] }> = [];
  let needsCore = false;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const { code, changed, notes } = transform(source) as {
      code: string;
      changed: boolean;
      notes?: string[];
    };
    if (notes && notes.length > 0) manual.push({ file, notes });
    if (!changed) continue;
    touched.push(file);
    if (code.includes('from "@cmssy/core"')) needsCore = true;
    if (!dry) await writeFile(file, code);
  }

  const report = (file: string) => file.slice(target.length + 1);

  if (touched.length === 0 && manual.length === 0) {
    console.log(
      `cmssy: nothing to migrate - no ${PREVIOUS_MAJOR[version]} imports found.`,
    );
    return;
  }

  if (touched.length > 0) {
    console.log(
      `cmssy: ${dry ? "would rewrite" : "rewrote"} ${touched.length} file(s):`,
    );
    for (const file of touched) console.log(`  ${report(file)}`);
  }

  if (manual.length > 0) {
    console.log(`\ncmssy: ${manual.length} file(s) need a look from you:\n`);
    for (const { file, notes } of manual) {
      console.log(`  ${report(file)}\n    ${notes.join("\n    ")}`);
    }
    console.log(`\n  ${MIGRATION_GUIDE[version]}`);
  }

  if (needsCore && !(await dependsOnCore(target))) {
    console.log(
      "\nYour code now imports @cmssy/core, which you do not depend on yet:\n" +
        "  npm install @cmssy/core   (or pnpm add / yarn add)",
    );
  }

  console.log(
    "\nThe imports moved; the wiring did not. Run your build, then the editor\n" +
      "smoke test - a site whose editor is dead still builds:\n" +
      "  https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/testing.md",
  );
}

async function dependsOnCore(target: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(
      await readFile(join(target, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    return Boolean(manifest.dependencies?.["@cmssy/core"]);
  } catch {
    return true;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
