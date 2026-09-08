import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";

export const BACKUP_DIR = ".cmssy-backup";

export interface CarriedLayout {
  cssImports: string[];
  metadata: string | null;
  needsMetadataType: boolean;
}

export interface RelocatedNextRoot {
  moved: Array<{ from: string; to: string }>;
  layout: CarriedLayout | null;
}

function existingFile(root: string, base: string): string | undefined {
  return ["tsx", "ts", "jsx", "js"]
    .map((extension) => `${base}.${extension}`)
    .find((candidate) => existsSync(join(root, candidate)));
}

function readMetadataBlock(source: string): string | null {
  const start = source.search(/^export const metadata\b/m);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const end = source.indexOf(";", index);
        return source.slice(start, end === -1 ? index + 1 : end + 1);
      }
    }
  }
  return null;
}

export function carryRootLayout(source: string): CarriedLayout {
  const cssImports = [
    ...source.matchAll(/^import\s+["']([^"']+\.css)["'];?\s*$/gm),
  ].map((match) => match[1] as string);
  const metadata = readMetadataBlock(source);
  return {
    cssImports,
    metadata,
    needsMetadataType: metadata !== null && /\bMetadata\b/.test(metadata),
  };
}

function rewriteImport(
  specifier: string,
  fromDir: string,
  toDir: string,
): string {
  if (!specifier.startsWith(".")) return specifier;
  const rewritten = posix.relative(toDir, posix.join(fromDir, specifier));
  return rewritten.startsWith(".") ? rewritten : `./${rewritten}`;
}

export function applyCarriedLayout(
  layoutSource: string,
  carried: CarriedLayout,
  originalDir: string,
  targetDir: string,
): string {
  const lines: string[] = [];
  if (carried.needsMetadataType) {
    lines.push('import type { Metadata } from "next";');
  }
  for (const specifier of carried.cssImports) {
    lines.push(`import "${rewriteImport(specifier, originalDir, targetDir)}";`);
  }
  if (lines.length === 0 && !carried.metadata) return layoutSource;

  const importBlock = layoutSource.match(/^(?:import[^\n]*\n)+/m);
  const cut = importBlock
    ? (importBlock.index ?? 0) + importBlock[0].length
    : 0;
  const carriedImports = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  const metadata = carried.metadata ? `\n${carried.metadata}\n` : "";
  return `${layoutSource.slice(0, cut)}${carriedImports}${metadata}${layoutSource.slice(cut)}`;
}

export function relocateNextRootFiles(
  root: string,
  prefix: string,
): RelocatedNextRoot {
  const moved: Array<{ from: string; to: string }> = [];
  let layout: CarriedLayout | null = null;
  for (const base of ["page", "layout"]) {
    const from = existingFile(root, `${prefix}app/${base}`);
    if (!from) continue;
    const to = posix.join(BACKUP_DIR, from);
    if (base === "layout") {
      layout = carryRootLayout(readFileSync(join(root, from), "utf8"));
    }
    mkdirSync(dirname(join(root, to)), { recursive: true });
    renameSync(join(root, from), join(root, to));
    moved.push({ from, to });
  }
  return { moved, layout };
}

export function patchCmssyLayout(
  root: string,
  target: string,
  carried: CarriedLayout,
  originalLayoutDir: string,
): boolean {
  const path = join(root, target);
  const source = readFileSync(path, "utf8");
  const patched = applyCarriedLayout(
    source,
    carried,
    originalLayoutDir,
    posix.dirname(target),
  );
  if (patched === source) return false;
  writeFileSync(path, patched);
  return true;
}

export function describeRelocation(
  relocated: RelocatedNextRoot,
  prefix: string,
): string[] {
  const lines = relocated.moved.map(
    ({ from, to }) =>
      `moved ${from} to ${to} - the cmssy catch-all now serves /`,
  );
  const { layout } = relocated;
  if (!layout) return lines;
  const css = layout.cssImports.length;
  const carried = [
    css > 0 ? `${css} global CSS import${css === 1 ? "" : "s"}` : null,
    layout.metadata ? "the metadata export" : null,
  ].filter((part): part is string => part !== null);
  const verb =
    carried.length > 0
      ? `carried ${carried.join(" and ")} into`
      : "nothing to carry into";
  lines.push(
    `${verb} both ${prefix}app/[[...path]]/layout.tsx and ${prefix}app/cmssy-edit/[[...path]]/layout.tsx - fonts, providers or anything else the old layout did are yours to port to BOTH`,
  );
  return lines;
}
