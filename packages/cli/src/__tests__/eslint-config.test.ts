import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { formatResult } from "../format";

import {
  ESLINT_CONFIG_FILE,
  ESLINT_PLUGIN,
  patchFlatConfig,
  wireEslintConfig,
} from "../eslint-config";

const ASSET = fileURLToPath(
  new URL("../../assets/init/eslint.config.mjs", import.meta.url),
);

const SPREAD = "...cmssy.configs.recommended";

const CREATE_NEXT_APP = `import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
`;

function parses(source: string): string[] {
  const { diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  });
  return (diagnostics ?? []).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  );
}

function patched(source: string): string {
  const result = patchFlatConfig(source);
  expect(result, "expected this config to be patchable").not.toBeNull();
  expect(parses(result!)).toEqual([]);
  return result!;
}

function makeApp(files: Record<string, string>, pkg: object = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "cmssy-eslint-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(cwd, name), content);
  }
  return { cwd, pkg: pkg as Parameters<typeof wireEslintConfig>[1] };
}

describe("patchFlatConfig", () => {
  it("appends the preset to the array a create-next-app config exports by name", () => {
    const result = patched(CREATE_NEXT_APP);

    expect(result).toContain(`import cmssy from "${ESLINT_PLUGIN}";\n`);
    expect(result).toContain(`export default [...eslintConfig, ${SPREAD}];`);
    expect(result).toContain('...compat.extends("next/core-web-vitals"');
  });

  it("appends inside an inline array, keeping its indentation and entries", () => {
    const result = patched(`import js from "@eslint/js";

export default [
  js.configs.recommended,
  { rules: { eqeqeq: "error" } },
];
`);

    expect(result).toBe(`import cmssy from "@cmssy/eslint-plugin";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  { rules: { eqeqeq: "error" } },
  ${SPREAD},
];
`);
  });

  it("appends inside defineConfig's array rather than wrapping the call", () => {
    const result = patched(`import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["dist"] },
]);
`);

    expect(result).toContain(`  ${SPREAD},\n]);`);
    expect(result).not.toContain("[...defineConfig");
  });

  it("appends a further argument to a variadic config builder", () => {
    const result = patched(`import tseslint from "typescript-eslint";

export default tseslint.config(js.configs.recommended, {
  rules: {},
});
`);

    expect(result).toContain(`},\n  ${SPREAD});`);
  });

  it("keeps a one-line array on one line", () => {
    expect(patched("export default [base, extra];\n")).toContain(
      `export default [base, extra, ${SPREAD}];`,
    );
  });

  it("fills an empty array", () => {
    expect(patched("export default [];\n")).toContain(`  ${SPREAD},`);
  });

  it("wraps an exported object, which flat config also accepts", () => {
    expect(
      patched('export default { rules: { eqeqeq: "error" } };\n'),
    ).toContain(
      `export default [...{ rules: { eqeqeq: "error" } }, ${SPREAD}];`,
    );
  });

  it("puts the import under a leading directive comment, not above it", () => {
    const result = patched(`// @ts-check
/* eslint-disable no-console */

export default [];
`);

    expect(result.split("\n")[0]).toBe("// @ts-check");
    expect(result).toContain(`*/\n\nimport cmssy from "${ESLINT_PLUGIN}";`);
  });

  it("extends the last default export when a comment mentions another", () => {
    const result = patched(`// export default legacy;
export default [a];
`);

    expect(result).toContain(`export default [a, ${SPREAD}];`);
    expect(result.match(/^export default/gm)).toHaveLength(1);
  });

  it("refuses a config with no default export", () => {
    expect(patchFlatConfig("module.exports = [];\n")).toBeNull();
    expect(patchFlatConfig("const config = [];\n")).toBeNull();
  });

  it("refuses an export it cannot read to the end of the file", () => {
    expect(
      patchFlatConfig(`export default [a];

console.log("still here");
`),
    ).toBeNull();
    expect(patchFlatConfig("export default [a;\n")).toBeNull();
  });

  it("is not fooled by brackets inside strings", () => {
    const result = patched(`export default [
  { ignores: ["**/*.mjs", "a]b"] },
];
`);
    expect(result).toContain(`  ${SPREAD},\n];`);
  });
});

describe("wireEslintConfig", () => {
  it("writes the config when the app has eslint and none of its own", () => {
    const { cwd, pkg } = makeApp({}, { devDependencies: { eslint: "^9.0.0" } });

    const result = wireEslintConfig(cwd, pkg, ASSET);

    expect(result.written).toBe(ESLINT_CONFIG_FILE);
    expect(result.dependency).toBe(true);
    expect(result.notes).toEqual([]);
    expect(readFileSync(join(cwd, ESLINT_CONFIG_FILE), "utf8")).toBe(
      readFileSync(ASSET, "utf8"),
    );
  });

  it("patches the app's own flat config in place", () => {
    const { cwd, pkg } = makeApp(
      { "eslint.config.mjs": CREATE_NEXT_APP },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    const result = wireEslintConfig(cwd, pkg, ASSET);

    expect(result.patched).toBe("eslint.config.mjs");
    expect(result.written).toBeUndefined();
    expect(result.dependency).toBe(true);
    const source = readFileSync(join(cwd, "eslint.config.mjs"), "utf8");
    expect(source).toContain(SPREAD);
    expect(source).toContain("next/core-web-vitals");
  });

  it("patches a typescript flat config, which eslint also loads", () => {
    const { cwd, pkg } = makeApp(
      { "eslint.config.ts": "export default [];\n" },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    expect(wireEslintConfig(cwd, pkg, ASSET).patched).toBe("eslint.config.ts");
  });

  it("changes nothing on a second run", () => {
    const { cwd, pkg } = makeApp(
      { "eslint.config.mjs": CREATE_NEXT_APP },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    wireEslintConfig(cwd, pkg, ASSET);
    const once = readFileSync(join(cwd, "eslint.config.mjs"), "utf8");
    const again = wireEslintConfig(cwd, pkg, ASSET);

    expect(again.patched).toBeUndefined();
    expect(again.dependency).toBe(true);
    expect(again.notes).toEqual([]);
    expect(readFileSync(join(cwd, "eslint.config.mjs"), "utf8")).toBe(once);
  });

  it("wires a config that only names the plugin in a comment", () => {
    const { cwd, pkg } = makeApp(
      {
        "eslint.config.mjs": `// import cmssy from "@cmssy/eslint-plugin";\nexport default [];\n`,
      },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    expect(wireEslintConfig(cwd, pkg, ASSET).patched).toBe("eslint.config.mjs");
    expect(readFileSync(join(cwd, "eslint.config.mjs"), "utf8")).toContain(
      SPREAD,
    );
  });

  it("counts a require of the plugin as already wired", () => {
    const source = `const cmssy = require("@cmssy/eslint-plugin");\nmodule.exports = [...cmssy.configs.recommended];\n`;
    const { cwd, pkg } = makeApp(
      { "eslint.config.cjs": source },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    const result = wireEslintConfig(cwd, pkg, ASSET);

    expect(result.notes).toEqual([]);
    expect(readFileSync(join(cwd, "eslint.config.cjs"), "utf8")).toBe(source);
  });

  it("leaves a commonjs config alone and prints the require form", () => {
    const source = "module.exports = [];\n";
    const { cwd, pkg } = makeApp(
      { "eslint.config.cjs": source },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    const result = wireEslintConfig(cwd, pkg, ASSET);

    expect(result.patched).toBeUndefined();
    expect(result.dependency).toBe(true);
    expect(result.notes[0]?.message).toContain("CommonJS");
    expect(result.notes[0]?.fix).toContain(`require("${ESLINT_PLUGIN}")`);
    expect(readFileSync(join(cwd, "eslint.config.cjs"), "utf8")).toBe(source);
  });

  it("leaves a config it cannot extend alone and prints the snippet", () => {
    const source = "const config = [];\n";
    const { cwd, pkg } = makeApp(
      { "eslint.config.mjs": source },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    const result = wireEslintConfig(cwd, pkg, ASSET);

    expect(result.notes[0]?.message).toContain("no default export");
    expect(result.notes[0]?.fix).toContain(SPREAD);
    expect(readFileSync(join(cwd, "eslint.config.mjs"), "utf8")).toBe(source);
  });

  it("names the legacy eslintrc rather than writing a flat config beside it", () => {
    const { cwd, pkg } = makeApp(
      { ".eslintrc.json": "{}\n" },
      { devDependencies: { eslint: "^8.0.0" } },
    );

    const result = wireEslintConfig(cwd, pkg, ASSET);

    expect(result.written).toBeUndefined();
    expect(result.notes[0]?.message).toContain(".eslintrc.json");
    expect(result.notes[0]?.fix).toContain("flat config");
    expect(result.dependency, "the snippet imports the plugin").toBe(true);
  });

  it("prefers the flat config when a legacy one is still lying around", () => {
    const { cwd, pkg } = makeApp(
      { ".eslintrc.json": "{}\n", "eslint.config.mjs": "export default [];\n" },
      { devDependencies: { eslint: "^9.0.0" } },
    );

    expect(wireEslintConfig(cwd, pkg, ASSET).patched).toBe("eslint.config.mjs");
  });

  it("installs nothing into an app that has no eslint", () => {
    const { cwd, pkg } = makeApp({}, { dependencies: { next: "^16.0.0" } });

    const result = wireEslintConfig(cwd, pkg, ASSET);

    expect(result.written).toBeUndefined();
    expect(result.dependency).toBe(false);
    expect(result.notes[0]?.message).toContain("no eslint");
    expect(result.notes[0]?.message).toContain("cmssy.configs.standalone");
  });

  it("prints the snippet through formatResult on every path it refuses", () => {
    const refusals: {
      files: Record<string, string>;
      eslint?: string;
      preset: string;
    }[] = [
      {
        files: { ".eslintrc.json": "{}\n" },
        eslint: "^8.0.0",
        preset: "cmssy.configs.standalone",
      },
      {
        files: { "eslint.config.cjs": "module.exports = [];\n" },
        eslint: "^9.0.0",
        preset: SPREAD,
      },
      {
        files: { "eslint.config.mjs": "const config = [];\n" },
        eslint: "^9.0.0",
        preset: SPREAD,
      },
      { files: {}, preset: "cmssy.configs.standalone" },
    ];

    for (const { files, eslint, preset } of refusals) {
      const { cwd, pkg } = makeApp(
        files,
        eslint ? { devDependencies: { eslint } } : { dependencies: {} },
      );
      const { notes } = wireEslintConfig(cwd, pkg, ASSET);
      const printed = notes
        .map((note) => formatResult(note, false))
        .join("\n");

      expect(notes, JSON.stringify(files)).toHaveLength(1);
      expect(printed, JSON.stringify(files)).toContain(preset);
    }
  });
});
