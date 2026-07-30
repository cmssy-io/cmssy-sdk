import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const TYPES = ["typescript@5", "@types/react@19", "@types/node@22"];

const FRAMEWORKS = {
  next: {
    deps: ["next@16", "react@19", "react-dom@19"],
    tarballs: ["core", "react", "next", "cli"],
    tsconfig: {
      jsx: "preserve",
      moduleResolution: "bundler",
      plugins: [{ name: "next" }],
      baseUrl: ".",
      paths: { "@/*": ["./*"] },
    },
    include: ["**/*.ts", "**/*.tsx"],
  },
  remix: {
    deps: [
      "react-router@7",
      "react@19",
      "react-dom@19",
      "@react-router/dev@7",
      "vite@6",
    ],
    tarballs: ["core", "react", "remix", "cli"],
    tsconfig: {
      jsx: "react-jsx",
      moduleResolution: "bundler",
      types: ["vite/client", "node"],
      rootDirs: [".", "./.react-router/types"],
    },
    include: ["**/*.ts", "**/*.tsx", ".react-router/types/**/*"],
    codegen: ["node_modules/.bin/react-router", ["typegen"]],
  },
};

const name = process.argv[2] ?? "next";
const framework = FRAMEWORKS[name];
if (!framework) {
  console.error(
    `unknown framework "${name}" - one of ${Object.keys(FRAMEWORKS).join(", ")}`,
  );
  process.exit(2);
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function capture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8" });
}

const packed = mkdtempSync(join(tmpdir(), "cmssy-tarballs-"));
run(
  "pnpm",
  [
    "-r",
    "--filter",
    "@cmssy/*",
    "exec",
    "pnpm",
    "pack",
    "--pack-destination",
    packed,
  ],
  ROOT,
);
const tarballs = readdirSync(packed);

function tarballFor(pkg) {
  const prefix = `cmssy-${pkg}-`;
  const file = tarballs.find((entry) => entry.startsWith(prefix));
  if (!file) throw new Error(`no tarball for @cmssy/${pkg} in ${packed}`);
  return join(packed, file);
}

const app = mkdtempSync(join(tmpdir(), `cmssy-${name}-probe-`));
mkdirSync(app, { recursive: true });
writeFileSync(
  join(app, "package.json"),
  `${JSON.stringify({ name: "scaffold-probe", private: true, version: "0.0.0", type: "module" }, null, 2)}\n`,
);
writeFileSync(
  join(app, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        module: "esnext",
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        isolatedModules: true,
        ...framework.tsconfig,
      },
      include: framework.include,
      exclude: ["node_modules"],
    },
    null,
    2,
  )}\n`,
);

console.log(`\n== installing ${name} + the packed SDK into ${app}\n`);
run(
  "npm",
  [
    "install",
    "--no-audit",
    "--no-fund",
    "--silent",
    ...framework.deps,
    ...TYPES,
  ],
  app,
);
run(
  "npm",
  [
    "install",
    "--no-audit",
    "--no-fund",
    "--silent",
    ...framework.tarballs.map(tarballFor),
  ],
  app,
);

console.log(`\n== cmssy init\n`);
const initOutput = capture(join(app, "node_modules/.bin/cmssy"), ["init"], app);
console.log(initOutput);

const written = [...initOutput.matchAll(/wrote (\S+)/g)].map((m) => m[1]);
if (written.length === 0) {
  console.error("cmssy init wrote nothing - the probe proves nothing");
  process.exit(1);
}

if (framework.codegen) {
  const [command, args] = framework.codegen;
  console.log(`== ${command} ${args.join(" ")}\n`);
  run(join(app, command), args, app);
}

console.log(`== typechecking ${written.length} scaffolded files\n`);
const tsc = join(app, "node_modules/.bin/tsc");
if (!existsSync(tsc)) {
  console.error(`no tsc at ${tsc} - the probe cannot check anything`);
  process.exit(1);
}
try {
  run(tsc, ["--noEmit"], app);
} catch {
  console.error(
    `\n${name}: the scaffold does not typecheck against the packed SDK.\n` +
      "This is what a consumer gets from npm: an exports map, not the workspace's\n" +
      "source paths. Check the package's exports and its published types.\n",
  );
  process.exit(1);
}
console.log(
  `\n${name}: the scaffold installs from a tarball and typechecks.\n`,
);
