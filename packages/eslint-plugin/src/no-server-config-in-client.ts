import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { Rule } from "eslint";

const SERVER_MODULES = [/^@cmssy\/next\/server$/];

const SERVER_SYMBOLS = new Set(["defineCmssyConfig"]);

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];

interface AliasConfig {
  baseUrl: string;
  paths: Record<string, string[]>;
}

const aliasCache = new Map<string, AliasConfig | null>();

// A tsconfig is JSONC, and every one of them contains both "@/*" and "**/*.ts".
// Stripping comments with a regex therefore matches the "/*" inside an alias and
// deletes everything up to the "*/" inside a glob - taking compilerOptions.paths
// with it. Only a scanner that knows where strings start and end can do this.
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }

    if (char === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 1;
      continue;
    }

    out += char;
  }

  return out.replace(/,(\s*[}\]])/g, "$1");
}

function readTsconfig(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(
      stripJsonComments(readFileSync(file, "utf8")),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function aliasConfigFor(fromFile: string): AliasConfig | null {
  let dir = dirname(fromFile);
  const visited: string[] = [];
  for (let up = 0; up < 12; up += 1) {
    const cached = aliasCache.get(dir);
    if (cached !== undefined) {
      for (const seen of visited) aliasCache.set(seen, cached);
      return cached;
    }
    visited.push(dir);

    const candidate = resolve(dir, "tsconfig.json");
    if (existsSync(candidate)) {
      const config = readTsconfig(candidate);
      const options = (config?.compilerOptions ?? {}) as Record<
        string,
        unknown
      >;
      const paths = options.paths as Record<string, string[]> | undefined;
      if (paths && Object.keys(paths).length > 0) {
        const baseUrl =
          typeof options.baseUrl === "string"
            ? resolve(dir, options.baseUrl)
            : dir;
        const found: AliasConfig = { baseUrl, paths };
        for (const seen of visited) aliasCache.set(seen, found);
        return found;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const seen of visited) aliasCache.set(seen, null);
  return null;
}

function withExtension(base: string): string | null {
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

// A path alias is the normal way to import in a Next.js app, so a resolver that
// only follows "./" walks almost nothing in a real repo. cmssy-io/cmssy-web#152
// shipped through this gap.
function resolveAlias(fromFile: string, specifier: string): string | null {
  const config = aliasConfigFor(fromFile);
  if (!config) return null;

  for (const [pattern, targets] of Object.entries(config.paths)) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (pattern !== specifier) continue;
      for (const target of targets) {
        const hit = withExtension(resolve(config.baseUrl, target));
        if (hit) return hit;
      }
      continue;
    }

    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const middle = specifier.slice(
      prefix.length,
      specifier.length - suffix.length,
    );
    for (const target of targets) {
      const hit = withExtension(
        resolve(config.baseUrl, target.replace("*", middle)),
      );
      if (hit) return hit;
    }
  }
  return null;
}

function resolveLocal(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    return withExtension(resolve(dirname(fromFile), specifier));
  }
  return resolveAlias(fromFile, specifier);
}

// A dynamic import is a code-splitting boundary: the browser fetches that chunk
// only if the path runs, so it is not part of what loading this module pulls in.
// Following it reported blocks/blog-posts, whose loader does exactly the
// `await import(...)` this rule tells people to write.
function valueImports(code: string): string[] {
  const withoutTypes = code
    .replace(/^\s*(?:import|export)\s+type\s[^;]*;/gm, "")
    .replace(/\bimport\s*\([^)]*\)/g, "");
  return [
    ...withoutTypes.matchAll(/(?:from|import)\s+["']([^"']+)["']/g),
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

function hasDirective(source: string, directive: string): boolean {
  return new RegExp(
    `^\\s*(?:\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*["']${directive}["']`,
  ).test(source);
}

// A server action is a real boundary: Next turns the import into an RPC
// reference, so the module body never reaches the browser. Walking through one
// reports code that is server-side by construction.
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

  if (hasDirective(code, "use server")) {
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

function normalize(path: string): string {
  return path.split(sep).join("/");
}

// "use client" is not the only way a module reaches the browser. A block
// registry has no directive of its own and is loaded by CmssyLazyEditor at
// runtime, so anything it imports is client code whatever the file looks like.
// Consumers name those files here.
function isClientEntry(filename: string, entries: string[]): boolean {
  const file = normalize(filename);
  return entries.some((entry) => {
    const wanted = normalize(entry);
    if (isAbsolute(wanted)) return file === wanted;
    return file === wanted || file.endsWith(`/${wanted}`);
  });
}

const cache = new Map<string, string[] | null>();

export const noServerConfigInClient: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a client component from importing values that read the cmssy server config",
    },
    schema: [
      {
        type: "object",
        properties: {
          clientEntries: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      reachesConfig:
        'This client component pulls the cmssy config into the browser bundle, where server env does not exist - the page will fail at runtime with "missing required configuration".\n  {{chain}}\nImport the type instead (types are erased), or move the value into a module that does not touch the config.',
      reachesConfigFromEntry:
        "This module is loaded in the browser, so it pulls the cmssy config there, where server env does not exist.\n  {{chain}}\nImport the type instead (types are erased), or load the value with a dynamic import inside the function that needs it.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const options = (context.options[0] ?? {}) as { clientEntries?: string[] };
    const entries = options.clientEntries ?? [];

    const client = hasDirective(context.sourceCode.getText(), "use client");
    const entry = isClientEntry(filename, entries);
    if (!client && !entry) return {};

    const messageId = client ? "reachesConfig" : "reachesConfigFromEntry";

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
            messageId,
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
          messageId,
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
