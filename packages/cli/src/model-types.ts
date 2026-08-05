export interface ModelFieldDefinition {
  key: string;
  label?: string | null;
  description?: string | null;
  type: string;
  required?: boolean | null;
  localized?: boolean | null;
  multiple?: boolean | null;
  hidden?: boolean | null;
  options?: string[] | null;
  relationTo?: string | null;
  relationType?: string | null;
  fields?: ModelFieldDefinition[] | null;
  itemType?: string | null;
  itemFields?: ModelFieldDefinition[] | null;
}

export interface ModelDefinition {
  slug: string;
  name?: string | null;
  description?: string | null;
  displayField?: string | null;
  fields: ModelFieldDefinition[];
}

const TEXTUAL = new Set([
  "text",
  "textarea",
  "richText",
  "markdown",
  "link",
  "url",
  "email",
  "phone",
  "color",
  "date",
  "datetime",
  "password",
  "pageSelector",
]);

const INDENT = "  ";

function pascalCase(value: string): string {
  const parts = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z]/.test(joined) ? joined : `Model${joined}`;
}

function propertyKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function stringUnion(options: string[]): string {
  return options.map((option) => JSON.stringify(option)).join(" | ");
}

function scalarType(field: ModelFieldDefinition): string {
  if (TEXTUAL.has(field.type)) {
    return field.localized ? "CmssyLocalized" : "string";
  }
  switch (field.type) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "media":
      return field.multiple ? "CmssyMedia[]" : "CmssyMedia";
    case "file":
      return field.multiple ? "CmssyFile[]" : "CmssyFile";
    case "select":
    case "radio":
      return field.options?.length ? stringUnion(field.options) : "string";
    case "multiselect":
      return field.options?.length
        ? `Array<${stringUnion(field.options)}>`
        : "string[]";
    case "relation":
      return field.relationType === "hasMany" || field.multiple
        ? "string[]"
        : "string";
    case "json":
    case "table":
    case "form":
      return "unknown";
    default:
      return "unknown";
  }
}

function fieldType(field: ModelFieldDefinition, depth: number): string {
  if (field.type === "object") {
    return field.fields?.length
      ? objectType(field.fields, depth)
      : "Record<string, unknown>";
  }
  if (field.type === "repeater" || field.type === "list") {
    if (field.itemFields?.length) {
      return `Array<${objectType(field.itemFields, depth)}>`;
    }
    if (field.itemType) {
      const item = scalarType({ key: field.key, type: field.itemType });
      return `${item.includes(" ") ? `Array<${item}>` : `${item}[]`}`;
    }
    return "unknown[]";
  }
  return scalarType(field);
}

function docComment(field: ModelFieldDefinition, pad: string): string[] {
  const parts: string[] = [];
  if (field.label && field.label !== field.key) parts.push(field.label);
  if (field.description) parts.push(field.description);
  if (field.type === "relation" && field.relationTo) {
    parts.push(
      `Record id(s) from \`${field.relationTo.replace(/^model:/, "")}\`.`,
    );
  }
  if (!parts.length) return [];
  return [`${pad}/** ${parts.join(" - ")} */`];
}

function members(fields: ModelFieldDefinition[], depth: number): string[] {
  const pad = INDENT.repeat(depth + 1);
  const lines: string[] = [];
  for (const field of fields) {
    if (field.hidden) continue;
    lines.push(...docComment(field, pad));
    const optional = field.required ? "" : "?";
    lines.push(
      `${pad}${propertyKey(field.key)}${optional}: ${fieldType(field, depth + 1)};`,
    );
  }
  return lines;
}

function objectType(fields: ModelFieldDefinition[], depth: number): string {
  const body = members(fields, depth);
  if (!body.length) return "Record<string, unknown>";
  return ["{", ...body, `${INDENT.repeat(depth)}}`].join("\n");
}

const PREAMBLE = `/** A translatable field: one string, or one per enabled language. */
export type CmssyLocalized = string | Record<string, string>;

/** What a media field reads back. Mirrors \`ResolvedMedia\` in @cmssy/types. */
export interface CmssyMedia {
  id: string;
  url: string | null;
  visibility: "public" | "private";
  alt?: string;
  width?: number;
  height?: number;
}

/** What a file field holds. Mirrors \`FileFieldValue\` in @cmssy/types. */
export type CmssyFile = string;

/** A record as \`public.model.records\` returns it, with \`data\` typed. */
export interface CmssyRecordOf<Data> {
  id: string;
  modelId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  data: Data;
}`;

export interface GenerateOptions {
  workspace: string;
  command?: string;
}

export function generateModelTypes(
  models: ModelDefinition[],
  options: GenerateOptions,
): string {
  const command = options.command ?? "npx @cmssy/cli types";
  const sorted = [...models].sort((a, b) => a.slug.localeCompare(b.slug));

  const used = new Map<string, string>();
  const typeNames = new Map<string, string>();
  for (const model of sorted) {
    let name = pascalCase(model.slug);
    if (used.has(name)) name = `${name}_${used.size}`;
    used.set(name, model.slug);
    typeNames.set(model.slug, name);
  }

  const blocks: string[] = [
    `// Generated by \`${command}\` from the "${options.workspace}" workspace.`,
    "// Do not edit: change the model in the CMS and run the command again.",
    "",
    PREAMBLE,
  ];

  for (const model of sorted) {
    const name = typeNames.get(model.slug) ?? pascalCase(model.slug);
    const title = model.name ?? model.slug;
    const doc = [`/**`, ` * ${title}`];
    if (model.description) doc.push(` *`, ` * ${model.description}`);
    doc.push(` *`, ` * Model slug: \`${model.slug}\``);
    if (model.displayField)
      doc.push(` * Display field: \`${model.displayField}\``);
    doc.push(` */`);

    blocks.push(
      "",
      doc.join("\n"),
      `export interface ${name}Data ${objectType(model.fields, 0)}`,
      "",
      `export type ${name}Record = CmssyRecordOf<${name}Data>;`,
    );
  }

  const mapEntries = sorted.map((model) => {
    const name = typeNames.get(model.slug) ?? pascalCase(model.slug);
    return `${INDENT}${propertyKey(model.slug)}: ${name}Data;`;
  });

  blocks.push(
    "",
    "/** Every model in the workspace, by slug. */",
    ["export interface CmssyModels {", ...mapEntries, "}"].join("\n"),
    "",
    "export type CmssyModelSlug = keyof CmssyModels;",
    "",
    "/** The typed record list `public.model.records` returns for a model. */",
    "export interface CmssyRecordList<Slug extends CmssyModelSlug> {",
    `${INDENT}items: Array<CmssyRecordOf<CmssyModels[Slug]>>;`,
    `${INDENT}total: number;`,
    `${INDENT}hasMore: boolean;`,
    "}",
    "",
  );

  return blocks.join("\n");
}
