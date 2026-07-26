/**
 * Fails when the docs import a symbol the packages do not export.
 *
 * Docs drift silently: 10.0 removed ~90 symbols and every guide kept teaching
 * them for six releases, because prose has no compiler. This gives it one - it
 * reads the code blocks the way a reader would, and asks the BUILT types
 * whether each import exists.
 *
 * Run after `pnpm -r build`: it reads dist, not src, so it checks what ships.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Markdown that documents the SDK. Migration guides included - a guide that
 *  names a symbol in a code block is a guide people copy from. */
function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

const FENCE = /```(?:ts|tsx|typescript|js|jsx)\n([\s\S]*?)```/g;
const IMPORT = /import\s+(type\s+)?({[^}]*}|[A-Za-z_$][\w$]*)\s+from\s+["'](@cmssy\/[^"']+)["']/g;

/** `{ a, type B, c as d }` -> ["a", "B", "c"] */
function namedImports(clause) {
  if (!clause.startsWith("{")) return [];
  return clause
    .slice(1, -1)
    .split(",")
    .map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
    .filter(Boolean);
}

/** The .d.ts a bare import of `specifier` resolves to, via the exports map. */
function typesEntry(specifier) {
  const [scope, name, ...rest] = specifier.split("/");
  const pkgDir = join(root, "packages", name);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const subpath = rest.length ? `./${rest.join("/")}` : ".";
  const entry = manifest.exports?.[subpath];
  const types = typeof entry === "string" ? entry : entry?.types;
  if (!types) return null;
  return join(pkgDir, types);
}

const exportCache = new Map();

function exportedNames(dtsPath) {
  if (exportCache.has(dtsPath)) return exportCache.get(dtsPath);
  const program = ts.createProgram([dtsPath], {
    noEmit: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
  });
  const source = program.getSourceFile(dtsPath);
  const checker = program.getTypeChecker();
  const symbol = source && checker.getSymbolAtLocation(source);
  const names = new Set(
    symbol ? checker.getExportsOfModule(symbol).map((e) => e.getName()) : [],
  );
  exportCache.set(dtsPath, names);
  return names;
}

/**
 * The field builders that actually exist. Imports are not the only way docs go
 * stale: `fields.singleLine` and `fields.numeric` were documented for months
 * and never existed - a reader copying either gets a runtime crash.
 */
const { fields } = await import(join(root, "packages/core/dist/index.js"));
const FIELD_BUILDERS = new Set(Object.keys(fields));
const FIELD_USE = /\bfields\.([A-Za-z_$][\w$]*)\s*\(/g;

const problems = [];
const files = [join(root, "README.md"), ...markdownFiles(join(root, "docs"))];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [block] of text.matchAll(FENCE)) {
    const where = file.slice(root.length + 1);
    for (const [, builder] of block.matchAll(FIELD_USE)) {
      if (!FIELD_BUILDERS.has(builder)) {
        problems.push(`${where}: there is no fields.${builder}()`);
      }
    }
    for (const [, , clause, specifier] of block.matchAll(IMPORT)) {
      const dts = typesEntry(specifier);
      if (!dts) {
        problems.push(`${where}: no such entry point - ${specifier}`);
        continue;
      }
      const exported = exportedNames(dts);
      if (exported.size === 0) {
        problems.push(`${where}: could not read the types of ${specifier}`);
        continue;
      }
      for (const name of namedImports(clause)) {
        if (!exported.has(name)) {
          problems.push(`${where}: ${specifier} does not export ${name}`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error("The docs name symbols the packages do not have:\n");
  for (const problem of [...new Set(problems)]) console.error(`  - ${problem}`);
  console.error(
    "\nEither the docs are stale, or an export was dropped by mistake.",
  );
  process.exit(1);
}

console.error(`Docs imports check out (${files.length} files).`);
