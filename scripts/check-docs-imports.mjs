import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
const IMPORT =
  /import\s+(type\s+)?({[^}]*}|[A-Za-z_$][\w$]*)\s+from\s+["'](@cmssy\/[^"']+)["']/g;

function namedImports(clause) {
  if (!clause.startsWith("{")) return [];
  return clause
    .slice(1, -1)
    .split(",")
    .map(
      (part) =>
        part
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0],
    )
    .filter(Boolean);
}

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
  const types = declarationsFor(manifest.exports?.[subpath]);
  if (!types) return null;
  return join(pkgDir, types);
}

function declarationsFor(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  if (typeof entry.types === "string") return entry.types;
  return declarationsFor(entry.import) ?? declarationsFor(entry.default);
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
