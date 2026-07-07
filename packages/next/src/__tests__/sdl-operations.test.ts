import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSchema, Kind, parse, validate, type DocumentNode } from "graphql";
import { describe, expect, it } from "vitest";

// Anti-drift guard for the SDK's raw GraphQL operation strings. The SDK talks
// to the backend over un-typed template literals, so a backend field rename
// (the namespacing clean break) breaks these only at runtime. This test parses
// every embedded operation and validates it against the committed backend SDL
// (schema.graphql at the repo root, refreshed via `pnpm sync-schema`). A stale
// operation turns a would-be production 400 into a red test.

const here = dirname(fileURLToPath(import.meta.url));
const schema = buildSchema(
  readFileSync(resolve(here, "../../../../schema.graphql"), "utf8"),
);

// Eagerly import every source module so a newly-added operation file is covered
// without editing this test. Test files are excluded to avoid re-running them.
// `import.meta.glob` is a Vite/Vitest static macro - it must stay a literal
// call here; ImportMeta.glob is typed in import-meta-glob.d.ts.
const modules = import.meta.glob(["../**/*.ts", "!../**/*.test.ts"], {
  eager: true,
});

type EmbeddedOp = { id: string; doc: DocumentNode };

const operations: EmbeddedOp[] = Object.entries(modules).flatMap(
  ([path, mod]) =>
    Object.entries(mod).flatMap(([name, value]) => {
      if (typeof value !== "string") return [];
      let doc: DocumentNode;
      try {
        doc = parse(value);
      } catch {
        return [];
      }
      const hasNamedOperation = doc.definitions.some(
        (d) => d.kind === Kind.OPERATION_DEFINITION && d.name != null,
      );
      return hasNamedOperation ? [{ id: `${path}:${name}`, doc }] : [];
    }),
);

describe("SDK operations validate against the backend SDL", () => {
  it("discovers embedded operations", () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  it.each(operations.map((op) => [op.id, op] as const))(
    "%s is valid against the schema",
    (_id, op) => {
      expect(validate(schema, op.doc).map((e) => e.message)).toEqual([]);
    },
  );
});
