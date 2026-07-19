import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { CliError } from "./admin-client";
import { formatResult } from "./format";
import {
  detectFramework,
  nextSrcPrefix,
  readPackageJson,
  type FrameworkDef,
} from "./framework";

const BLOCK_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export interface AddBlockOptions {
  name: string;
  dir?: string;
}

export interface AddBlockDeps {
  cwd: string;
  log: (line: string) => void;
}

interface BlockNames {
  type: string;
  label: string;
  pascal: string;
  camel: string;
  block: string;
  props: string;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function blockNames(name: string): BlockNames {
  const words = name.split("-");
  const pascal = words.map(capitalize).join("");
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return {
    type: name,
    label: words.map(capitalize).join(" "),
    pascal,
    camel,
    block: `${camel}Block`,
    props: `${camel}Props`,
  };
}

function nextBlockDefinition(names: BlockNames): string {
  return `import { defineBlock } from "@cmssy/react";
import ${names.pascal}, { ${names.props} } from "./${names.pascal}";

export const ${names.block} = defineBlock({
  type: "${names.type}",
  label: "${names.label}",
  component: ${names.pascal},
  props: ${names.props},
});
`;
}

function nextComponent(names: BlockNames): string {
  return `import { fields, type BlockProps } from "@cmssy/react";

export const ${names.props} = {
  heading: fields.text({ label: "Heading", required: true }),
  text: fields.textarea({ label: "Text" }),
};

export default function ${names.pascal}({ content }: BlockProps<typeof ${names.props}>) {
  return (
    <section>
      <h2>{content.heading}</h2>
      {content.text ? <p>{content.text}</p> : null}
    </section>
  );
}
`;
}

function singleFileComponent(names: BlockNames): string {
  return `import { fields, type BlockProps } from "@cmssy/react";

export const ${names.props} = {
  heading: fields.text({ label: "Heading", required: true }),
  text: fields.textarea({ label: "Text" }),
};

export function ${names.pascal}({ content }: BlockProps<typeof ${names.props}>) {
  return (
    <section>
      <h2>{content.heading}</h2>
      {content.text ? <p>{content.text}</p> : null}
    </section>
  );
}
`;
}

function insertAfterImports(source: string, line: string): string {
  const imports = [...source.matchAll(/^import .*$/gm)];
  const last = imports[imports.length - 1];
  if (last === undefined) return `${line}\n${source}`;
  const end = (last.index ?? 0) + last[0].length;
  return `${source.slice(0, end)}\n${line}${source.slice(end)}`;
}

function appendToBlocksArray(source: string, identifier: string): string {
  const match = source.match(/export const blocks = \[([\s\S]*?)\]/);
  if (!match) {
    throw new CliError(
      "could not find `export const blocks = [...]` in the block registry",
      `add the block yourself: import it and append ${identifier} to the blocks array`,
    );
  }
  const inner = match[1] ?? "";
  let updated: string;
  if (inner.trim() === "") {
    updated = identifier;
  } else if (inner.includes("\n")) {
    const body = inner.replace(/[\s,]*$/, "");
    const indent = /\n(\s*)\S/.exec(inner)?.[1] ?? "  ";
    updated = `${body},\n${indent}${identifier},\n`;
  } else {
    updated = `${inner.trim().replace(/,$/, "")}, ${identifier}`;
  }
  return source.replace(match[0], `export const blocks = [${updated}]`);
}

interface RegistryLayout {
  registryPath: string;
  componentPath: string;
  files: { path: string; content: string }[];
  registerInRegistry: (source: string, names: BlockNames) => string;
}

function frameworkLayout(
  framework: FrameworkDef,
  root: string,
  names: BlockNames,
): RegistryLayout {
  if (framework.name === "next") {
    const prefix = nextSrcPrefix(root);
    const componentPath = `${prefix}blocks/${names.type}/${names.pascal}.tsx`;
    return {
      registryPath: `${prefix}cmssy/blocks.ts`,
      componentPath,
      files: [
        {
          path: `${prefix}blocks/${names.type}/block.ts`,
          content: nextBlockDefinition(names),
        },
        { path: componentPath, content: nextComponent(names) },
      ],
      registerInRegistry: (source) =>
        appendToBlocksArray(
          insertAfterImports(
            source,
            `import { ${names.block} } from "@/blocks/${names.type}/block";`,
          ),
          names.block,
        ),
    };
  }
  const base = framework.name === "astro" ? "src/cmssy" : "app/cmssy";
  const componentPath = `${base}/${names.type}.tsx`;
  return {
    registryPath: `${base}/blocks.ts`,
    componentPath,
    files: [{ path: componentPath, content: singleFileComponent(names) }],
    registerInRegistry: (source) => {
      let updated = insertAfterImports(
        source,
        `import { ${names.pascal}, ${names.props} } from "./${names.type}";`,
      );
      if (
        !/import \{[^}]*defineBlock[^}]*\} from "@cmssy\/react"/.test(updated)
      ) {
        updated = insertAfterImports(
          updated,
          `import { defineBlock } from "@cmssy/react";`,
        );
      }
      const definition = `export const ${names.block} = defineBlock({
  type: "${names.type}",
  label: "${names.label}",
  component: ${names.pascal},
  props: ${names.props},
});

`;
      const anchor = updated.indexOf("export const blocks =");
      if (anchor === -1) {
        throw new CliError(
          "could not find `export const blocks = [...]` in the block registry",
          `add the block yourself: define ${names.block} with defineBlock and append it to the blocks array`,
        );
      }
      updated = `${updated.slice(0, anchor)}${definition}${updated.slice(anchor)}`;
      return appendToBlocksArray(updated, names.block);
    },
  };
}

export function runAddBlock(
  options: AddBlockOptions,
  deps: AddBlockDeps,
): number {
  const { log } = deps;
  try {
    if (!BLOCK_NAME_PATTERN.test(options.name)) {
      throw new CliError(
        `"${options.name}" is not a valid block name`,
        "use kebab-case: cmssy add block pricing-table",
      );
    }
    const root = resolve(deps.cwd, options.dir ?? ".");
    if (!existsSync(root)) {
      throw new CliError(
        `${root} does not exist`,
        "pass --dir with the app's directory, or run cmssy add block inside it",
      );
    }
    const framework = detectFramework(readPackageJson(root));
    const names = blockNames(options.name);
    const layout = frameworkLayout(framework, root, names);

    const registryFile = join(root, layout.registryPath);
    if (!existsSync(registryFile)) {
      throw new CliError(
        `no block registry at ${layout.registryPath}`,
        "run cmssy init first - it wires the registry the editor loads blocks from",
      );
    }
    const registry = readFileSync(registryFile, "utf8");
    if (
      registry.includes(names.block) ||
      registry.includes(`type: "${names.type}"`)
    ) {
      throw new CliError(
        `block "${names.type}" is already registered in ${layout.registryPath}`,
      );
    }
    for (const file of layout.files) {
      if (existsSync(join(root, file.path))) {
        throw new CliError(
          `${file.path} already exists`,
          "pick another name or remove the existing block first",
        );
      }
    }

    log(
      formatResult({
        status: "ok",
        message: `detected ${framework.label} - scaffolding block "${names.type}"`,
      }),
    );
    for (const file of layout.files) {
      const target = join(root, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
      log(formatResult({ status: "ok", message: `wrote ${file.path}` }));
    }
    writeFileSync(registryFile, layout.registerInRegistry(registry, names));
    log(
      formatResult({
        status: "ok",
        message: `registered ${names.block} in ${layout.registryPath}`,
      }),
    );

    log("");
    log("Next steps:");
    log(`  1. edit ${layout.componentPath} - define the fields and markup`);
    log(
      `  2. restart your dev server - the editor picks up "${names.type}" from the next handshake`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      log(
        formatResult({
          status: "fail",
          message: error.message,
          fix: error.fix,
        }),
      );
      return 1;
    }
    log(
      formatResult({
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return 1;
  }
}
