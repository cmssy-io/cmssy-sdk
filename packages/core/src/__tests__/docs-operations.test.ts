import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSchema, Kind, parse, validate, type DocumentNode } from "graphql";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const schemaPath = process.env.CMSSY_SCHEMA_FILE
  ? resolve(repoRoot, process.env.CMSSY_SCHEMA_FILE)
  : resolve(repoRoot, "schema.graphql");
const schema = buildSchema(readFileSync(schemaPath, "utf8"));

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? markdownFiles(full)
      : full.endsWith(".md")
        ? [full]
        : [];
  });
}

const FENCED_BLOCK = /```([a-z]*)\n([\s\S]*?)```/g;
const BACKTICKED_OPERATION = /`((?:query|mutation|subscription)\s[\s\S]*?)`/g;

interface DocumentedOperation {
  id: string;
  doc: DocumentNode;
}

const documented: DocumentedOperation[] = [];
const unparseable: string[] = [];

for (const file of [
  ...markdownFiles(resolve(repoRoot, "docs")),
  resolve(repoRoot, "README.md"),
]) {
  const text = readFileSync(file, "utf8");
  for (const [, language, block] of text.matchAll(FENCED_BLOCK)) {
    const body = block ?? "";
    const candidates =
      language === "graphql"
        ? [body]
        : [...body.matchAll(BACKTICKED_OPERATION)].map((match) => match[1] ?? "");
    for (const candidate of candidates) {
      let doc: DocumentNode;
      try {
        doc = parse(candidate);
      } catch (error) {
        if (language === "graphql") {
          unparseable.push(
            `${relative(repoRoot, file)}: ${(error as Error).message.split("\n")[0]}`,
          );
        }
        continue;
      }
      const named = doc.definitions.find(
        (definition) => definition.kind === Kind.OPERATION_DEFINITION,
      );
      if (!named) continue;
      documented.push({
        id: `${relative(repoRoot, file)}:${
          named.kind === Kind.OPERATION_DEFINITION
            ? (named.name?.value ?? "anonymous")
            : "anonymous"
        }`,
        doc,
      });
    }
  }
}

describe("operations in the docs validate against the backend SDL", () => {
  it("finds the operations the docs print", () => {
    expect(
      documented.length,
      "A reader copies these. If extraction broke, the per-operation assertion below would iterate an empty list and pass having validated nothing.",
    ).toBeGreaterThanOrEqual(6);
  });

  it("parses every block fenced as graphql", () => {
    expect(
      unparseable,
      "A block fenced ```graphql is a whole document, so a syntax error in one is a broken example, not a sketch to skip. Skipping it would also hide it from the validation below while the count stayed put.",
    ).toEqual([]);
  });

  it.each(documented.map((entry) => [entry.id, entry] as const))(
    "%s is valid against the schema",
    (_id, entry) => {
      expect(
        validate(schema, entry.doc).map((error) => error.message),
        "A documented query naming a field the schema does not have is worse than no example: it compiles in the reader's editor, ships, and answers 400. `recipes.md` and `server-loaders.md` both queried a root `publicPagesByType` that has never existed - the field is `public.page.byType`.",
      ).toEqual([]);
    },
  );
});
