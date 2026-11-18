import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BIN = join(ROOT, "node_modules/.bin");

const packages = readdirSync(join(ROOT, "packages")).filter((name) => {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "packages", name, "package.json"), "utf8"),
  );
  return pkg.private !== true;
});

const failed = [];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  return result.status === 0;
}

function moduleExports(program, checker, file, valuesOnly) {
  const source = program.getSourceFile(file);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!symbol) return null;
  return checker
    .getExportsOfModule(symbol)
    .filter((exported) => {
      if (!valuesOnly) return true;
      const target =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      return (target.flags & ts.SymbolFlags.Value) !== 0;
    })
    .map((exported) => exported.name);
}

function declaredValuesMissingAtRuntime(dir, exportsMap) {
  const pairs = Object.entries(exportsMap).flatMap(([subpath, entry]) => {
    const esm = entry?.import;
    return esm?.types && esm?.default
      ? [
          {
            subpath,
            types: join(dir, esm.types),
            runtime: join(dir, esm.default),
          },
        ]
      : [];
  });
  const program = ts.createProgram(
    pairs.flatMap((pair) => [pair.types, pair.runtime]),
    {
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    },
  );
  const checker = program.getTypeChecker();

  return pairs.flatMap(({ subpath, types, runtime }) => {
    const declared = moduleExports(program, checker, types, true);
    const shipped = moduleExports(program, checker, runtime, false);
    if (!declared || !shipped) return [`${subpath}: unreadable entry`];
    const present = new Set(shipped);
    return declared
      .filter((name) => !present.has(name))
      .map((name) => `${subpath}: ${name}`);
  });
}

for (const name of packages) {
  const dir = join(ROOT, "packages", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

  console.log(`\n=== ${pkg.name} ===\n`);

  if (!run(join(BIN, "publint"), ["--strict", dir], ROOT)) {
    failed.push(`${pkg.name}: publint`);
  }

  if (!pkg.exports) {
    console.log("no exports map - skipping the types resolution check");
    continue;
  }

  if (!run(join(BIN, "attw"), ["--pack", "--profile", "node16", "."], dir)) {
    failed.push(`${pkg.name}: attw`);
  }

  const missing = declaredValuesMissingAtRuntime(dir, pkg.exports);
  if (missing.length > 0) {
    console.error(
      `typed as a value but missing from the JS bundle:\n  ${missing.join("\n  ")}`,
    );
    failed.push(`${pkg.name}: declared values missing at runtime`);
  }
}

if (failed.length > 0) {
  console.error(
    `\nWhat a consumer installs is wrong in ${failed.length} place(s):\n  ${failed.join("\n  ")}\n`,
  );
  process.exit(1);
}

console.log(
  `\n${packages.length} packages: publishable shape and types resolve.\n`,
);
