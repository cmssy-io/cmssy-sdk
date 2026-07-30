import { parse, print } from "graphql";
import { describe, expect, it } from "vitest";

import { documentText } from "../data/document";

function inlined(source: string): unknown {
  return JSON.parse(JSON.stringify(parse(source)));
}

class TypedDocumentString {
  constructor(private readonly source: string) {}
  toString(): string {
    return this.source;
  }
}

const CASES: Array<[string, string]> = [
  [
    "a query with variables and arguments",
    `query PublicPageMeta($workspaceSlug: String!, $slug: String!) {
      public { page { get(workspaceSlug: $workspaceSlug, slug: $slug) { seoTitle seoKeywords } } }
    }`,
  ],
  [
    "an alias, a default value and a list type",
    `query Products($limit: Int = 24, $ids: [String!]!) {
      items: products(limit: $limit, ids: $ids) { id }
    }`,
  ],
  [
    "literal arguments of every scalar kind",
    `query Literals {
      search(text: "hi", count: 3, ratio: 1.5, on: true, missing: null, kind: DRAFT, tags: ["a", "b"], where: { slug: "x", nested: { n: 1 } }) { id }
    }`,
  ],
  [
    "a mutation with an input object variable",
    `mutation AddToCart($input: AddToCartInput!) { cart { addItem(input: $input) { id } } }`,
  ],
  [
    "fragments, spreads and inline fragments",
    `query WithFragments {
      page { ...PageFields ... on Article { body } }
    }
    fragment PageFields on Page { id slug }`,
  ],
  [
    "directives",
    `query Directed($skipIt: Boolean!) { page @include(if: $skipIt) { id @skip(if: $skipIt) } }`,
  ],
  ["an anonymous query", `{ page { id } }`],
];

describe("documentText", () => {
  it("returns a plain string untouched", () => {
    expect(documentText("query { a }")).toBe("query { a }");
  });

  it("reads a TypedDocumentString through toString()", () => {
    const document = new TypedDocumentString("query Named { a }");
    expect(documentText(document)).toBe("query Named { a }");
  });

  it("prefers the source a parsed document carries", () => {
    const source = "query Parsed { page { id } }";
    expect(documentText(parse(source))).toBe(source);
  });

  describe("printing an inlined AST (no loc, as codegen emits)", () => {
    for (const [label, source] of CASES) {
      it(`re-parses to the same document: ${label}`, () => {
        const printed = documentText(inlined(source));
        expect(print(parse(printed))).toBe(print(parse(source)));
      });
    }
  });

  it("refuses a value it cannot read a query out of", () => {
    expect(() => documentText({ not: "a document" })).toThrow(/document/i);
    expect(() => documentText(undefined)).toThrow(/document/i);
  });
});
