import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSchema, Kind, parse, validate, type DocumentNode } from "graphql";
import { describe, expect, it } from "vitest";

import * as adminClient from "../admin-client";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const schemaPath = process.env.CMSSY_SCHEMA_FILE
  ? resolve(repoRoot, process.env.CMSSY_SCHEMA_FILE)
  : resolve(repoRoot, "schema.graphql");
const schema = buildSchema(readFileSync(schemaPath, "utf8"));

const operations = Object.entries(adminClient).flatMap(([name, value]) => {
  if (typeof value !== "string" || !/^\s*(query|mutation)\b/.test(value)) {
    return [];
  }
  const doc: DocumentNode = parse(value);
  return doc.definitions.some((d) => d.kind === Kind.OPERATION_DEFINITION)
    ? [[name, doc] as const]
    : [];
});

describe("CLI admin operations validate against the backend SDL", () => {
  it("discovers the admin client's operations", () => {
    expect(operations.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "SAVE_BLOCK_MANIFEST_MUTATION",
        "BLOCK_MANIFEST_IMPACT_QUERY",
        "WORKSPACES_MINE_QUERY",
      ]),
    );
  });

  it.each(operations)("%s is valid against the schema", (_name, doc) => {
    expect(validate(schema, doc).map((e) => e.message)).toEqual([]);
  });
});
