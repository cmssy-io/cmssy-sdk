import type {
  BlockPropsSchema,
  CmssyModelRecord,
  FieldControl,
  FieldOptions,
  FieldType,
  FieldTypeValueMap,
  FieldDefinition,
  InferBlockContent,
  RelationMode,
  TypedField,
} from "@cmssy/types";

export type {
  BlockPropsSchema,
  FieldControl,
  FieldOptions,
  InferBlockContent,
  TypedField,
};

type Declared<O> = O extends { required: true } ? true : false;

type OptionValue<O> = O extends {
  options: readonly (infer Option extends string)[];
}
  ? Option
  : string;

type MediaValue<O> = O extends { multiple: true } ? string[] : string;

type RepeaterValue<O> = O extends {
  itemSchema: infer Schema extends BlockPropsSchema;
}
  ? InferBlockContent<Schema>[]
  : Record<string, unknown>[];

type RelationValue<O> = O extends { mode: "all" } | { multiple: true }
  ? CmssyModelRecord[]
  : CmssyModelRecord | undefined;

interface RelationFieldOptions extends Omit<
  FieldOptions,
  "options" | "itemSchema"
> {
  model: string;
  mode?: RelationMode;
  multiple?: boolean;
  sort?: string;
  limit?: number;
}

function build(type: FieldType, opts: FieldOptions): FieldDefinition {
  return { type, label: opts.label ?? "", ...opts } as FieldDefinition;
}

function control<T extends FieldType>(type: T) {
  return <const O extends FieldOptions>(opts: O = {} as O) =>
    build(type, opts) as TypedField<FieldTypeValueMap[T], Declared<O>>;
}

function choice<T extends "select" | "radio">(type: T) {
  return <const O extends FieldOptions>(opts: O) =>
    build(type, opts) as TypedField<OptionValue<O>, Declared<O>>;
}

export const fields = {
  text: control("text"),
  textarea: control("textarea"),
  richText: control("richText"),
  markdown: control("markdown"),
  number: control("number"),
  date: control("date"),
  datetime: control("datetime"),
  boolean: control("boolean"),
  color: control("color"),
  link: control("link"),
  url: control("url"),
  email: control("email"),
  table: control("table"),
  json: control("json"),
  form: control("form"),
  pageSelector: control("pageSelector"),

  select: choice("select"),
  radio: choice("radio"),

  multiselect: <const O extends FieldOptions>(opts: O) =>
    build("multiselect", opts) as TypedField<OptionValue<O>[], Declared<O>>,

  media: <const O extends FieldOptions>(opts: O = {} as O) =>
    build("media", opts) as TypedField<MediaValue<O>, Declared<O>>,

  repeater: <const O extends FieldOptions>(opts: O) =>
    build("repeater", opts) as TypedField<RepeaterValue<O>, Declared<O>>,

  relation: <const O extends RelationFieldOptions>(opts: O) => {
    const { model, mode, ...rest } = opts;
    return build("relation", {
      ...rest,
      relationTo: `model:${model}`,
      relationType: mode === "all" || opts.multiple ? "hasMany" : "hasOne",
      relationMode: mode ?? "picked",
    }) as TypedField<RelationValue<O>, Declared<O>>;
  },
};
