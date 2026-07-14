import type {
  BlockPropsSchema,
  FieldControl,
  FieldOptions,
  FieldType,
  FieldTypeValueMap,
  FieldDefinition,
  InferBlockContent,
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

function build(type: FieldType, opts: FieldOptions): FieldDefinition {
  return { type, label: opts.label ?? "", ...opts } as FieldDefinition;
}

/**
 * Every builder returns a `TypedField`, so `defineBlock` can derive the block's
 * `content` from its schema instead of trusting a hand-written type beside it.
 * The `const` type parameter is what makes that possible: it keeps `required`,
 * `options` and `itemSchema` as literals instead of widening them away.
 */
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
};
