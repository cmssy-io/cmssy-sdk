import { describe, it, expect, expectTypeOf } from "vitest";
import type { BlockPropsSchema, InferBlockContent } from "@cmssy/types";
import { fields } from "../fields";

const declaredByHand: BlockPropsSchema = {
  specs: { type: "table", label: "Specs", maxColumns: 3 },
  hero: {
    type: "media",
    label: "Hero",
    aspectRatio: "16:9",
    aspectRatios: ["16:9", { w: 5, h: 4 }],
  },
  logo: { type: "media", label: "Logo", localized: false },
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
      "This is the version pin, and the annotation above is the part that does the work: a fresh literal in declared position is excess-property-checked, so it stops compiling against a @cmssy/types whose FieldDefinition has no maxColumns. The builder call now pins it too - fields.table is constrained by TableFieldOptions, whose keys the Only<> guard maps to never once they leave the shape - but the hand-written literal is the one that cannot be argued with.",
    ).toStrictEqual({ type: "table", label: "Specs", maxColumns: 3 });
  });

  it("declares no cap when the block states none", () => {
    expect(
      fields.table({ label: "Specs" }),
      "An absent key is what the backend reads as 'this field declares nothing', which is what falls back to the global advisory. A key present as undefined would be a different manifest.",
    ).toStrictEqual({ type: "table", label: "Specs" });
  });
});

describe("fields.media", () => {
  it("carries the ratio the block renders at and the ratios an editor may crop to", () => {
    expect(
      fields.media({
        label: "Hero",
        aspectRatio: "16:9",
        aspectRatios: ["16:9", { w: 5, h: 4 }],
      }),
      "The cmssy backend reads aspectRatio off the pushed manifest to shape a reference that carries no crop of its own, and the editor reads aspectRatios for the crop picker. Both only get there because build() spreads opts through.",
    ).toStrictEqual({
      type: "media",
      label: "Hero",
      aspectRatio: "16:9",
      aspectRatios: ["16:9", { w: 5, h: 4 }],
    });
  });

  it("matches a field written straight into a BlockPropsSchema", () => {
    expect(
      declaredByHand.hero,
      "The version pin for @cmssy/types 0.43.0: a fresh literal in declared position is excess-property-checked, so this file stops compiling against a FieldDefinition that has no aspectRatio / aspectRatios. The builder call above pins it as well now, for the reason given on the table pin.",
    ).toStrictEqual({
      type: "media",
      label: "Hero",
      aspectRatio: "16:9",
      aspectRatios: ["16:9", { w: 5, h: 4 }],
    });
  });

  it("declares no ratio when the block states none", () => {
    expect(
      fields.media({ label: "Hero" }),
      "An absent aspectRatio is what the delivery resolver reads as 'keep the asset's own shape'. A key present as undefined would be a different manifest.",
    ).toStrictEqual({ type: "media", label: "Hero" });
  });

  it("carries a declaration that the field is the same in every language", () => {
    expect(
      fields.media({ label: "Logo", localized: false }),
      "cmssy stores a localized: false field once, in the block's shared bucket, and folds it into every locale at delivery (CMS-1784). Without the key on the pushed manifest the value goes back to being written once per language.",
    ).toStrictEqual({ type: "media", label: "Logo", localized: false });
  });

  it("matches a shared field written straight into a BlockPropsSchema", () => {
    expect(
      declaredByHand.logo,
      "The version pin for @cmssy/types 0.49.0: a fresh literal in declared position is excess-property-checked, so this file stops compiling against a FieldDefinition that has no localized. The builder call above pins it as well now, for the reason given on the table pin.",
    ).toStrictEqual({ type: "media", label: "Logo", localized: false });
  });

  it("declares nothing about localization when the block states none", () => {
    expect(
      fields.media({ label: "Hero" }),
      "cmssy reads localized !== false as per language, so a key present as undefined and an absent key agree - but only an absent key says the block never made the choice.",
    ).not.toHaveProperty("localized");
  });
});

describe("a field's options are scoped to the field", () => {
  it("refuses a media constraint on a text field", () => {
    const field = fields.text({
      label: "Heading",
      // @ts-expect-error aspectRatio is a media option
      aspectRatio: "16:9",
    });
    expect(field.type).toBe("text");
  });

  it("refuses a repeater's bounds on a text field", () => {
    const field = fields.text({
      label: "Heading",
      // @ts-expect-error minItems bounds a repeater, not a string
      minItems: 3,
    });
    expect(field.type).toBe("text");
  });

  it("refuses a choice's options on a colour field", () => {
    const field = fields.color({
      label: "Accent",
      // @ts-expect-error only select/radio/multiselect read options
      options: ["red", "blue"],
    });
    expect(field.type).toBe("color");
  });

  it("refuses a key no field has", () => {
    const field = fields.text({
      label: "Heading",
      // @ts-expect-error a key no field has at all
      requred: true,
    });
    expect(field.type).toBe("text");
  });

  it("refuses a repeater's own option spelled wrong", () => {
    const field = fields.repeater({
      label: "Links",
      itemSchema: { href: fields.link({ label: "Href" }) },
      // @ts-expect-error maxItms is maxItems
      maxItms: 3,
    });
    expect(field.type).toBe("repeater");
  });

  it("refuses one on a builder that can be called with no options at all", () => {
    const field = fields.media({
      label: "Logo",
      // @ts-expect-error a default argument is not a reason to stop checking the one that was given
      aspectRatioo: "16:9",
    });
    expect(field.type).toBe("media");
  });

  it("refuses one on relation, which accepts more than the field options", () => {
    const field = fields.relation({
      label: "Posts",
      model: "post",
      // @ts-expect-error relation adds model, mode, multiple, sort and limit - nothing else
      moode: "all",
    });
    expect(field.type).toBe("relation");
  });

  it("still infers what the field declares about itself", () => {
    const schema = {
      heading: fields.text({ label: "Heading", required: true }),
      align: fields.select({ label: "Align", options: ["left", "right"] }),
    };
    type Content = InferBlockContent<typeof schema>;

    expectTypeOf<Content>().toEqualTypeOf<{
      heading: string;
      align?: "left" | "right";
    }>();
  });
});
