import type { FieldDefinition, FieldType, FieldControl } from "@cmssy/types";

export type { FieldControl };

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
  table: control("table"),
  json: control("json"),
  form: control("form"),
  pageSelector: control("pageSelector"),
};
