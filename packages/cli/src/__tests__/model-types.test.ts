import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { generateModelTypes, type ModelDefinition } from "../model-types";

const product: ModelDefinition = {
  slug: "product",
  name: "Product",
  displayField: "title",
  fields: [
    {
      key: "title",
      label: "Title",
      type: "text",
      required: true,
      localized: true,
    },
    { key: "slug", type: "text", required: true },
    { key: "price", type: "number", required: true },
    { key: "inStock", type: "boolean" },
    { key: "image", type: "media" },
    { key: "gallery", type: "media", multiple: true },
    { key: "manual", type: "file" },
    { key: "attachments", type: "file", multiple: true },
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
    expect(output).toContain("slug: string;");
  });

  it("maps media, select and multiselect", () => {
    const output = generate();
    expect(output).toContain("image?: CmssyMedia | null;");
    expect(output).toContain("gallery?: CmssyMedia[];");
    expect(output).toContain('unit?: "pcs" | "kg";');
    expect(output).toContain('tags?: Array<"new" | "sale">;');
  });

  it("gives file its own type, so a change to media cannot reach it", () => {
    const output = generate();
    expect(output).toContain("manual?: CmssyFile;");
    expect(output).toContain("attachments?: CmssyFile[];");
    expect(output).toContain("CmssyMedia | null");
    expect(output).not.toContain("manual?: CmssyMedia");
  });

  it("imports the shared shapes instead of declaring them", () => {
    const output = generate();
    expect(output).toContain('} from "@cmssy/core";');
    for (const name of [
      "CmssyLocalizedValue as CmssyLocalized",
      "ResolvedMedia as CmssyMedia",
      "FileFieldValue as CmssyFile",
      "CmssyModelRecord as CmssyRecordOf",
    ]) {
      expect(output).toContain(name);
    }
  });

  it("declares no shape the contract package owns", () => {
    const output = generate();
    for (const declaration of [
      "export interface CmssyMedia {",
      "export type CmssyFile =",
      "export type CmssyLocalized =",
      "export interface CmssyRecordOf<",
    ]) {
      expect(output).not.toContain(declaration);
    }
  });

  it("re-exports the imported names so consumer code keeps compiling", () => {
    const output = generate();
    expect(output).toContain(
      "export type { CmssyLocalized, CmssyMedia, CmssyFile, CmssyRecordOf };",
    );
  });

  it("types a relation as the ids it stores, and says which model", () => {
    const output = generate();
    expect(output).toContain("category?: string;");
    expect(output).toContain("related?: string[];");
    expect(output).toContain("Record id(s) from `category`");
  });

  it("inlines object fields and repeater items", () => {
    const output = generate();
    expect(output).toMatch(
      /specs\?: \{\n\s+material\?: string;\n\s+weightKg\?: number;\n\s+\};/,
    );
    expect(output).toMatch(/faq\?: Array<\{\n\s+question: string;/);
  });

  it("leaves hidden fields out", () => {
    expect(generate()).not.toContain("internalNote");
  });

  it("exports the slug map and a record type per model", () => {
    const output = generate();
    expect(output).toContain(
      "export type ProductRecord = CmssyRecordOf<ProductData>;",
    );
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

describe("generated output compiles against the real @cmssy/core", () => {
  it("resolves every imported name to a type the package actually exports", () => {
    const dir = mkdtempSync(join(tmpdir(), "cmssy-model-types-"));
    const file = join(dir, "models.ts");
    writeFileSync(
      file,
      `${generateModelTypes([product], { workspace: "acme" })}
const _media: CmssyMedia = {
  id: "m1",
  url: null,
  visibility: "public",
  altText: "from the reference",
  transform: { width: 800, fit: "cover", quality: 80 },
};
const _localized: CmssyLocalized = null;
const _record: ProductRecord = {
  id: "r1",
  modelId: "m",
  status: null,
  createdAt: null,
  updatedAt: null,
  data: { title: "t", slug: "s", price: 1 },
};
void _media;
void _localized;
void _record;
`,
    );

    const program = ts.createProgram([file], {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: resolve(__dirname, "../../../.."),
      paths: { "@cmssy/core": ["packages/core/src/index.ts"] },
    });

    const messages = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === file.replace(/\\/g, "/"))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));

    expect(messages).toEqual([]);
  });
});
