import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PreflightResult } from "@cmssy/core/preflight";

import type { PackageManifest } from "./framework";

export const ESLINT_PLUGIN = "@cmssy/eslint-plugin";

export const ESLINT_CONFIG_FILE = "eslint.config.mjs";

export const ESLINT_PURPOSE =
  "the two wiring mistakes no build catches: server config pulled into a client bundle, and a provider the /cmssy-edit route never gets";

const FLAT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
];

const LEGACY_CONFIGS = [
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  ".eslintrc",
];

const SPREAD = "...cmssy.configs.recommended";

const IMPORT_LINE = `import cmssy from "${ESLINT_PLUGIN}";`;

const STANDALONE_SNIPPET = `${IMPORT_LINE}\n       export default [...cmssy.configs.standalone];`;

const APPEND_SNIPPET = `${IMPORT_LINE}\n       export default [...yourConfig, ${SPREAD}];`;

const REQUIRE_SNIPPET = `const cmssy = require("${ESLINT_PLUGIN}");\n       module.exports = [...yourConfig, ${SPREAD}];`;

const INLINE_STANDALONE = `an ${ESLINT_CONFIG_FILE} of \`${IMPORT_LINE} export default [...cmssy.configs.standalone];\``;

const BUILDERS = new Set([
  "config",
  "defineConfig",
  "defineFlatConfig",
  "tseslint.config",
]);

const RULES =
  "cmssy/edit-route-provider-parity and cmssy/no-server-config-in-client";

export interface EslintWiring {
  written?: string;
  patched?: string;
  dependency: boolean;
  notes: PreflightResult[];
}

interface ExpressionShape {
  balanced: boolean;
  single: boolean;
}

function describeExpression(expression: string): ExpressionShape {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let closed = -1;

  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i]!;

    if (char === '"' || char === "'" || char === "`") {
      i += 1;
      while (i < expression.length && expression[i] !== char) {
        if (expression[i] === "\\") i += 1;
        i += 1;
      }
      if (i >= expression.length) return { balanced: false, single: false };
      continue;
    }

    if (char === "/" && expression[i + 1] === "/") {
      while (i < expression.length && expression[i] !== "\n") i += 1;
      continue;
    }

    if (char === "/" && expression[i + 1] === "*") {
      i += 2;
      while (
        i < expression.length &&
        !(expression[i] === "*" && expression[i + 1] === "/")
      ) {
        i += 1;
      }
      if (i >= expression.length) return { balanced: false, single: false };
      i += 1;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      stack.push(char);
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      if (stack.pop() !== pairs[char])
        return { balanced: false, single: false };
      if (stack.length === 0) closed = i;
      continue;
    }

    if (char === ";" && stack.length === 0) {
      return { balanced: false, single: false };
    }
  }

  return {
    balanced: stack.length === 0,
    single: closed === expression.length - 1,
  };
}

function indentOf(inner: string): string {
  return /\n([ \t]+)\S/.exec(inner)?.[1] ?? "  ";
}

function appendItem(inner: string): string {
  if (inner.trim() === "") return `\n  ${SPREAD},\n`;
  if (!inner.includes("\n")) {
    return `${inner.replace(/,\s*$/, "")}, ${SPREAD}`;
  }
  const body = inner.replace(/\s+$/, "");
  const close = /\n([ \t]*)$/.exec(inner);
  const item = `${body}${body.endsWith(",") ? "" : ","}\n${indentOf(inner)}${SPREAD}`;
  return close ? `${item},\n${close[1]}` : item;
}

function patchExpression(expression: string): string | null {
  const shape = describeExpression(expression);
  if (!shape.balanced) return null;

  if (expression.startsWith("[") && expression.endsWith("]") && shape.single) {
    return `[${appendItem(expression.slice(1, -1))}]`;
  }

  const call = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(([\s\S]*)\)$/.exec(
    expression,
  );
  if (call && shape.single && BUILDERS.has(call[1]!)) {
    const args = call[2]!;
    const only = args.trim();
    if (only.startsWith("[") && only.endsWith("]")) {
      const inner = patchExpression(only);
      if (inner) return `${call[1]}(${inner})`;
    }
    return `${call[1]}(${appendItem(args)})`;
  }

  return `[...${expression}, ${SPREAD}]`;
}

function insertImport(source: string): string {
  const lines = source.split("\n");
  let at = 0;
  let block = false;

  for (; at < lines.length; at += 1) {
    const line = lines[at]!.trim();
    if (block) {
      if (line.includes("*/")) block = false;
      continue;
    }
    if (line === "" || line.startsWith("//") || line.startsWith("#!")) continue;
    if (line.startsWith("/*")) {
      block = !line.includes("*/");
      continue;
    }
    break;
  }

  const next = lines[at] ?? "";
  const spacer = next.trim() === "" || next.startsWith("import ") ? [] : [""];
  lines.splice(at, 0, IMPORT_LINE, ...spacer);
  return lines.join("\n");
}

export function patchFlatConfig(source: string): string | null {
  const exports = [...source.matchAll(/^export default\b/gm)];
  const last = exports.at(-1);
  if (last?.index === undefined) return null;

  const head = source.slice(0, last.index);
  const expression = source
    .slice(last.index + "export default".length)
    .trim()
    .replace(/;$/, "")
    .trimEnd();
  if (expression === "") return null;

  const patched = patchExpression(expression);
  if (!patched) return null;

  const result = insertImport(`${head}export default ${patched};\n`);
  if (!result.includes(SPREAD)) return null;
  return result;
}

function findFile(root: string, names: string[]): string | undefined {
  return names.find((name) => existsSync(join(root, name)));
}

export function wireEslintConfig(
  root: string,
  pkg: PackageManifest,
  asset: string,
): EslintWiring {
  const flat = findFile(root, FLAT_CONFIGS);
  const legacy = findFile(root, LEGACY_CONFIGS);
  const installed =
    pkg.dependencies?.eslint !== undefined ||
    pkg.devDependencies?.eslint !== undefined;

  if (!flat && legacy) {
    return {
      dependency: false,
      notes: [
        {
          status: "fail",
          message: `${legacy} is the legacy eslintrc format, so ${RULES} were not wired`,
          fix: `migrate to flat config (an eslint.config.mjs) and add:\n       ${STANDALONE_SNIPPET}`,
        },
      ],
    };
  }

  if (!flat && !installed) {
    return {
      dependency: false,
      notes: [
        {
          status: "unknown",
          message: `this app has no eslint, so ${RULES} were not wired - they are the only check for a provider the editor route never gets; install eslint and rerun, or write ${INLINE_STANDALONE} yourself`,
        },
      ],
    };
  }

  if (!flat) {
    copyFileSync(asset, join(root, ESLINT_CONFIG_FILE));
    return { written: ESLINT_CONFIG_FILE, dependency: true, notes: [] };
  }

  const source = readFileSync(join(root, flat), "utf8");
  if (source.includes(ESLINT_PLUGIN)) {
    return { dependency: true, notes: [] };
  }

  if (flat.endsWith(".cjs") || /\bmodule\.exports\b/.test(source)) {
    return {
      dependency: true,
      notes: [
        {
          status: "fail",
          message: `${flat} is CommonJS, so ${RULES} were not wired - it was left untouched`,
          fix: `add them yourself:\n       ${REQUIRE_SNIPPET}`,
        },
      ],
    };
  }

  const patched = patchFlatConfig(source);
  if (!patched) {
    return {
      dependency: true,
      notes: [
        {
          status: "fail",
          message: `${flat} has no default export this can extend, so ${RULES} were not wired - it was left untouched`,
          fix: `add them yourself:\n       ${APPEND_SNIPPET}`,
        },
      ],
    };
  }

  writeFileSync(join(root, flat), patched);
  return { patched: flat, dependency: true, notes: [] };
}
