import { describe, it, expect } from "vitest";
import { fields } from "../fields";

describe("fields.table", () => {
  it("carries the column cap the block declares", () => {
    expect(
      fields.table({ label: "Specs", maxColumns: 3 }),
      "The cmssy backend reads maxColumns off the pushed manifest to decide whether a table is too wide for the field holding it. It only ever gets there because build() spreads opts through - and it only compiles because @cmssy/types declares the property on FieldOptions, which is what typecheck, not this assertion, is the witness for.",
    ).toStrictEqual({ type: "table", label: "Specs", maxColumns: 3 });
  });

  it("declares no cap when the block states none", () => {
    expect(
      fields.table({ label: "Specs" }),
      "An absent key is what the backend reads as 'this field declares nothing', which is what falls back to the global advisory. A key present as undefined would be a different manifest.",
    ).toStrictEqual({ type: "table", label: "Specs" });
  });
});
