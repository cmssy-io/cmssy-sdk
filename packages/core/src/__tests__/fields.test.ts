import { describe, it, expect } from "vitest";
import type { BlockPropsSchema } from "@cmssy/types";
import { fields } from "../fields";

const declaredByHand: BlockPropsSchema = {
  specs: { type: "table", label: "Specs", maxColumns: 3 },
};

describe("fields.table", () => {
  it("carries the column cap the block declares", () => {
    expect(
      fields.table({ label: "Specs", maxColumns: 3 }),
      "The cmssy backend reads maxColumns off the pushed manifest to decide whether a table is too wide for the field holding it. It only ever gets there because build() spreads opts through.",
    ).toStrictEqual({ type: "table", label: "Specs", maxColumns: 3 });
  });

  it("matches a field written straight into a BlockPropsSchema", () => {
    expect(
      declaredByHand.specs,
      "This is the version pin, and the annotation above is the part that does the work: a fresh literal in declared position is excess-property-checked, so it stops compiling against a @cmssy/types whose FieldDefinition has no maxColumns. The builder call cannot pin it - control() takes <const O extends FieldOptions>, and a generic constraint checks assignability without excess-property-checking, so fields.table swallows any key at all.",
    ).toStrictEqual({ type: "table", label: "Specs", maxColumns: 3 });
  });

  it("declares no cap when the block states none", () => {
    expect(
      fields.table({ label: "Specs" }),
      "An absent key is what the backend reads as 'this field declares nothing', which is what falls back to the global advisory. A key present as undefined would be a different manifest.",
    ).toStrictEqual({ type: "table", label: "Specs" });
  });
});
