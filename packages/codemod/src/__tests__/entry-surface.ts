import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const BLOCK = /export\s+(?:type\s+)?\{([^}]*)\}/g;
const DECLARATION =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g;

function exportedNames(file: string): Set<string> {
  const code = readFileSync(file, "utf8");
  if (/export\s+\*/.test(code)) {
    throw new Error(
      `${file} re-exports with "export *", which this reader cannot resolve - it would report a symbol as missing`,
    );
  }
  const names = new Set<string>();
  for (const block of code.matchAll(BLOCK)) {
    for (const part of (block[1] ?? "").split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  for (const declaration of code.matchAll(DECLARATION)) {
    const name = declaration[1];
    if (name) names.add(name);
  }
  return names;
}

function sourceFor(directory: string, dist: string): string | null {
  const source = join(
    PACKAGES,
    directory,
    dist.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts"),
  );
  return existsSync(source) ? source : null;
}

let cached: Map<string, Set<string>> | null = null;

export function entrySurface(): Map<string, Set<string>> {
  if (cached) return cached;
  const surface = new Map<string, Set<string>>();
  for (const directory of readdirSync(PACKAGES)) {
    const manifest = join(PACKAGES, directory, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
      name?: string;
      exports?: Record<string, { import?: { default?: string } }>;
    };
    if (!pkg.name) continue;
    for (const [subpath, condition] of Object.entries(pkg.exports ?? {})) {
      const dist = condition?.import?.default;
      if (!dist) continue;
      const source = sourceFor(directory, dist);
      if (!source) continue;
      surface.set(
        pkg.name + (subpath === "." ? "" : subpath.slice(1)),
        exportedNames(source),
      );
    }
  }
  cached = surface;
  return surface;
}

export function exportsOf(entry: string): Set<string> {
  const names = entrySurface().get(entry);
  if (!names) {
    throw new Error(`${entry} is not an entry point of any package here`);
  }
  return names;
}
