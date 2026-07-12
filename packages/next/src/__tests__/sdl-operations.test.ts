import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSchema,
  Kind,
  parse,
  validate,
  type DocumentNode,
  type OperationDefinitionNode,
} from "graphql";
import { describe, expect, it } from "vitest";

// Anti-drift guard for the SDK's raw GraphQL operation strings. The SDK talks
// to the backend over un-typed template literals, so a backend field rename
// (the namespacing clean break) breaks these only at runtime. This test parses
// every embedded operation and validates it against the committed backend SDL
// (schema.graphql at the repo root, refreshed via `pnpm sync-schema`). A stale
// operation turns a would-be production 400 into a red test.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const schemaPath = process.env.CMSSY_SCHEMA_FILE
  ? resolve(repoRoot, process.env.CMSSY_SCHEMA_FILE)
  : resolve(repoRoot, "schema.graphql");
const schema = buildSchema(readFileSync(schemaPath, "utf8"));

// Eagerly import every source module so a newly-added operation file is covered
// without editing this test. Test files and declaration files are excluded -
// `import.meta.glob` is a Vite/Vitest static macro that must stay a literal
// call here; ImportMeta.glob is typed in import-meta-glob.d.ts.
const modules = import.meta.glob(
  ["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!../**/*.d.ts"],
  { eager: true },
);

// A string must be parseable iff, after any leading comment lines, it opens with
// a GraphQL operation or fragment keyword; anything else (URLs, plain config
// strings) is legitimately skipped. This stops a syntactically-broken op from
// being silently dropped - including one that starts with a comment or fragment.
function looksLikeGraphQL(value: string): boolean {
  const body = value.replace(/^(?:\s*#[^\n]*\n)*/, "").trimStart();
  return /^(query|mutation|subscription|fragment)\b/.test(body);
}

type EmbeddedOp = { id: string; doc: DocumentNode };

const operations: EmbeddedOp[] = [];
const parseFailures: string[] = [];
const unnamedOperations: string[] = [];

for (const [path, mod] of Object.entries(modules)) {
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== "string") continue;
    let doc: DocumentNode;
    try {
      doc = parse(value);
    } catch (err) {
      if (looksLikeGraphQL(value)) {
        parseFailures.push(`${path}:${name}: ${(err as Error).message}`);
      }
      continue;
    }
    const operationDefs = doc.definitions.filter(
      (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
    );
    if (operationDefs.length === 0) continue; // fragment-only / non-operation
    // Validate every operation doc, named or not, and separately require names
    // so an unnamed op can't slip past the drift guard.
    if (operationDefs.some((d) => d.name == null)) {
      unnamedOperations.push(`${path}:${name}`);
    }
    operations.push({ id: `${path}:${name}`, doc });
  }
}

describe("SDK operations validate against the backend SDL", () => {
  it("discovers embedded operations", () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  it("every operation-looking string parses", () => {
    expect(parseFailures).toEqual([]);
  });

  it("every operation is named", () => {
    expect(unnamedOperations).toEqual([]);
  });

  it.each(operations.map((op) => [op.id, op] as const))(
    "%s is valid against the schema",
    (_id, op) => {
      expect(validate(schema, op.doc).map((e) => e.message)).toEqual([]);
    },
  );
});
