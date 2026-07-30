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

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const schemaPath = process.env.CMSSY_SCHEMA_FILE
  ? resolve(repoRoot, process.env.CMSSY_SCHEMA_FILE)
  : resolve(repoRoot, "schema.graphql");
const schema = buildSchema(readFileSync(schemaPath, "utf8"));

const modules = import.meta.glob(
  ["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!../**/*.d.ts"],
  { eager: true },
);

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
    if (operationDefs.length === 0) continue;
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
