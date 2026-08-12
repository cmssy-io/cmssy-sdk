import type {
  BlockPropsSchema,
  CmssyModelRecord,
  FieldControl,
  FieldOptions,
  FieldType,
  FieldTypeValueMap,
  FieldDefinition,
  InferBlockContent,
  PageRef,
  ResolvedMediaValue,
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

/**
 * Whether the content is guaranteed to carry the field. Required says so, and
 * so does a declared default - normalization puts it in place when the author
 * leaves the field empty, so the key is always there.
 */
type Declared<O> = O extends { required: true }
  ? true
  : O extends { defaultValue: infer Default }
    ? undefined extends Default
      ? false
      : true
    : false;

/**
 * For the field types whose default normalization never puts in place, so only
 * `required` can promise the key is there.
 *
 * A relation's stored value is an id and records are fetched before
 * normalization runs, so a default could only ever land as a raw id under a
 * type that promises a record. Media is the same story one layer out: the
 * delivery API resolves it from the manifest before a block ever sees it. A
 * repeater is descended into rather than visited, so nothing writes the list
 * itself. Counting a default for any of them would type the key as always
 * present and leave it missing - or present in the wrong shape.
 */
type RequiredOnly<O> = O extends { required: true } ? true : false;

type OptionValue<O> = O extends {
  options: readonly (infer Option extends string)[];
}
  ? Option
  : string;

type MediaValue<O> = ResolvedMediaValue<
  O extends { multiple: true } ? true : false
>;

type RepeaterValue<O> = O extends {
  itemSchema: infer Schema extends BlockPropsSchema;
}
  ? InferBlockContent<Schema>[]
  : Record<string, unknown>[];

type RelationValue<O> = O extends { mode: "all" } | { multiple: true }
  ? CmssyModelRecord[]
  : CmssyModelRecord | undefined;

/**
 * A page selector holds a list unless it is explicitly single. The default is
 * the multiple one, which is the reading the editor already takes: it treats
 * only `multiple: false` as single.
 */
type PageSelectorValue<O> = O extends { multiple: false }
  ? PageRef | undefined
  : PageRef[];

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

  select: choice("select"),
  radio: choice("radio"),

  multiselect: <const O extends FieldOptions>(opts: O) =>
    build("multiselect", opts) as TypedField<OptionValue<O>[], Declared<O>>,

  media: <const O extends FieldOptions>(opts: O = {} as O) =>
    build("media", opts) as TypedField<MediaValue<O>, RequiredOnly<O>>,

  pageSelector: <const O extends FieldOptions>(opts: O = {} as O) =>
    build("pageSelector", opts) as TypedField<
      PageSelectorValue<O>,
      Declared<O>
    >,

  repeater: <const O extends FieldOptions>(opts: O) =>
    build("repeater", opts) as TypedField<RepeaterValue<O>, RequiredOnly<O>>,

  relation: <const O extends RelationFieldOptions>(opts: O) => {
    const { model, mode, ...rest } = opts;
    return build("relation", {
      ...rest,
      relationTo: `model:${model}`,
      relationType: mode === "all" || opts.multiple ? "hasMany" : "hasOne",
      relationMode: mode ?? "picked",
    }) as TypedField<RelationValue<O>, RequiredOnly<O>>;
  },
};
