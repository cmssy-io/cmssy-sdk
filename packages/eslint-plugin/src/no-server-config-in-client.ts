import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Rule } from "eslint";

const SERVER_MODULES = [/^@cmssy\/next\/server$/];

const SERVER_SYMBOLS = new Set(["defineCmssyConfig"]);

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];

function resolveLocal(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const ext of EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
  }
  for (const ext of EXTENSIONS.slice(1)) {
    const candidate = `${base}/index${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function valueImports(code: string): string[] {
  const withoutTypes = code.replace(
    /^\s*(?:import|export)\s+type\s[^;]*;/gm,
    "",
  );
  return [
    ...withoutTypes.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
  ].map(([, specifier]) => specifier ?? "");
}

function importsServerConfig(code: string): boolean {
  if (
    SERVER_MODULES.some((pattern) =>
      valueImports(code).some((s) => pattern.test(s)),
    )
  ) {
    return true;
  }
  return [...SERVER_SYMBOLS].some((symbol) =>
    new RegExp(`\\b${symbol}\\b`).test(
      code.replace(/^\s*(?:import|export)\s+type\s[^;]*;/gm, ""),
    ),
  );
}

function chainToServerConfig(
  file: string,
  cache: Map<string, string[] | null>,
  seen = new Set<string>(),
): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  const cached = cache.get(file);
  if (cached !== undefined) return cached;

  let code: string;
  try {
    code = readFileSync(file, "utf8");
  } catch {
    cache.set(file, null);
    return null;
  }

  if (importsServerConfig(code)) {
    const chain = [file];
    cache.set(file, chain);
    return chain;
  }

  for (const specifier of valueImports(code)) {
    const next = resolveLocal(file, specifier);
    if (!next) continue;
    const deeper = chainToServerConfig(next, cache, seen);
    if (deeper) {
      const chain = [file, ...deeper];
      cache.set(file, chain);
      return chain;
    }
  }
  cache.set(file, null);
  return null;
}

function isClientFile(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
    source,
  );
}

const cache = new Map<string, string[] | null>();

export const noServerConfigInClient: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a client component from importing values that read the cmssy server config",
    },
    schema: [],
    messages: {
      reachesConfig:
        'This client component pulls the cmssy config into the browser bundle, where server env does not exist - the page will fail at runtime with "missing required configuration".\n  {{chain}}\nImport the type instead (types are erased), or move the value into a module that does not touch the config.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isClientFile(context.sourceCode.getText())) return {};

    return {
      ImportDeclaration(node) {
        const typed = node as { importKind?: string };
        const onlyTypes =
          typed.importKind === "type" ||
          (node.specifiers.length > 0 &&
            node.specifiers.every(
              (s) => (s as { importKind?: string }).importKind === "type",
            ));
        if (onlyTypes) return;

        const specifier = String(node.source.value);
        if (SERVER_MODULES.some((pattern) => pattern.test(specifier))) {
          context.report({
            node,
            messageId: "reachesConfig",
            data: { chain: `${specifier} is server-only` },
          });
          return;
        }

        const target = resolveLocal(filename, specifier);
        if (!target) return;
        const chain = chainToServerConfig(target, cache);
        if (!chain) return;

        context.report({
          node,
          messageId: "reachesConfig",
          data: {
            chain: [filename, ...chain]
              .map((f) => f.split("/").slice(-2).join("/"))
              .join(" -> "),
          },
        });
      },
    };
  },
};
