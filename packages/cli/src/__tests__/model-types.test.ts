import { describe, expect, it } from "vitest";

import {
  generateModelTypes,
  type ModelDefinition,
} from "../model-types";

const product: ModelDefinition = {
  slug: "product",
  name: "Product",
  displayField: "title",
  fields: [
    { key: "title", label: "Title", type: "text", required: true, localized: true },
    { key: "slug", type: "text", required: true },
    { key: "price", type: "number", required: true },
    { key: "inStock", type: "boolean" },
    { key: "image", type: "media" },
    { key: "gallery", type: "media", multiple: true },
    { key: "unit", type: "select", options: ["pcs", "kg"] },
    { key: "tags", type: "multiselect", options: ["new", "sale"] },
    {
      key: "category",
      type: "relation",
      relationTo: "model:category",
      relationType: "hasOne",
    },
    {
      key: "related",
      type: "relation",
      relationTo: "model:product",
      relationType: "hasMany",
    },
    {
      key: "specs",
      type: "object",
      fields: [
        { key: "material", type: "text" },
        { key: "weightKg", type: "number" },
      ],
    },
    {
      key: "faq",
      type: "repeater",
      itemFields: [
        { key: "question", type: "text", required: true },
        { key: "answer", type: "textarea" },
      ],
    },
    { key: "internalNote", type: "text", hidden: true },
  ],
};

function generate(models: ModelDefinition[] = [product]): string {
  return generateModelTypes(models, { workspace: "acme" });
}

describe("generateModelTypes", () => {
  it("names the workspace and the command in the header", () => {
    const output = generate();
    expect(output).toContain('from the "acme" workspace');
    expect(output).toContain("npx @cmssy/cli types");
    expect(output).toContain("Do not edit");
  });

  it("makes a required field non-optional and the rest optional", () => {
    const output = generate();
    expect(output).toContain("slug: string;");
    expect(output).toContain("inStock?: boolean;");
  });

  it("types a localized field as string-or-map", () => {
    const output = generate();
    expect(output).toContain("title: CmssyLocalized;");
    // A non-localized text field stays a plain string.
    expect(output).toContain("slug: string;");
  });

  it("maps media, select and multiselect", () => {
    const output = generate();
    expect(output).toContain("image?: string;");
    expect(output).toContain("gallery?: string[];");
    expect(output).toContain('unit?: "pcs" | "kg";');
    expect(output).toContain('tags?: Array<"new" | "sale">;');
  });

  it("types a relation as the ids it stores, and says which model", () => {
    const output = generate();
    expect(output).toContain("category?: string;");
    expect(output).toContain("related?: string[];");
    expect(output).toContain("Record id(s) from `category`");
  });

  it("inlines object fields and repeater items", () => {
    const output = generate();
    expect(output).toMatch(/specs\?: \{\n\s+material\?: string;\n\s+weightKg\?: number;\n\s+\};/);
    expect(output).toMatch(/faq\?: Array<\{\n\s+question: string;/);
  });

  it("leaves hidden fields out", () => {
    expect(generate()).not.toContain("internalNote");
  });

  it("exports the slug map and a record type per model", () => {
    const output = generate();
    expect(output).toContain("export type ProductRecord = CmssyRecordOf<ProductData>;");
    expect(output).toContain("product: ProductData;");
    expect(output).toContain("export type CmssyModelSlug = keyof CmssyModels;");
  });

  it("quotes a slug that is not an identifier", () => {
    const output = generate([{ slug: "blog-post", fields: [] }]);
    expect(output).toContain('"blog-post": BlogPostData;');
    expect(output).toContain("export interface BlogPostData");
  });

  it("keeps two slugs that pascal-case alike apart", () => {
    const output = generate([
      { slug: "shop-member", fields: [{ key: "a", type: "text" }] },
      { slug: "shopMember", fields: [{ key: "b", type: "text" }] },
    ]);
    const names = [...output.matchAll(/export interface (\w+)Data/g)].map(
      (match) => match[1],
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("orders models by slug, so the output does not churn", () => {
    const one = generate([
      { slug: "b", fields: [] },
      { slug: "a", fields: [] },
    ]);
    const two = generate([
      { slug: "a", fields: [] },
      { slug: "b", fields: [] },
    ]);
    expect(one).toBe(two);
  });
});
