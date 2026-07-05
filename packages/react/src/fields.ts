import type { FieldDefinition, FieldType } from "./bridge/protocol";

export type FieldControl = Omit<FieldDefinition, "type" | "label"> & {
  label?: string;
};

function control(type: FieldType) {
  return (opts: FieldControl = {}): FieldDefinition => ({
    type,
    label: opts.label ?? "",
    ...opts,
  });
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
  media: control("media"),
  link: control("link"),
  url: control("url"),
  email: control("email"),
  select: control("select"),
  multiselect: control("multiselect"),
  radio: control("radio"),
  repeater: control("repeater"),
  form: control("form"),
  pageSelector: control("pageSelector"),
};
