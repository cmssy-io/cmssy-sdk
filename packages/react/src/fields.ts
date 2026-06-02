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
  singleLine: control("singleLine"),
  multiLine: control("multiLine"),
  richText: control("richText"),
  numeric: control("numeric"),
  date: control("date"),
  media: control("media"),
  link: control("link"),
  select: control("select"),
  multiselect: control("multiselect"),
  boolean: control("boolean"),
  color: control("color"),
  repeater: control("repeater"),
};
