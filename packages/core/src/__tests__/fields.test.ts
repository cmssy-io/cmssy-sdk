import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  BlockPropsSchema,
  InferBlockContent,
  ResolvedMediaValue,
} from "@cmssy/types";
import { fields } from "../fields";
import type { CmssyRecordSort, ModelRecordsVariables } from "../data/queries";

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
      "The version pin for @cmssy/types 0.52.0: a fresh literal in declared position is excess-property-checked, so this file stops compiling against a FieldDefinition that has no localized. The builder call above pins it as well now, for the reason given on the table pin.",
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

  it("accepts only the record sort grammar on relation", () => {
    const field = fields.relation({
      model: "post",
      mode: "all",
      sort: "order_asc",
    });
    expect(field.sort).toBe("order_asc");
    fields.relation({ model: "post", mode: "all", sort: "createdAt_desc" });
    // @ts-expect-error the API rejects anything but <fieldKey>_asc / <fieldKey>_desc
    fields.relation({ model: "post", mode: "all", sort: "-createdAt" });
    // @ts-expect-error the direction is lowercase
    fields.relation({ model: "post", mode: "all", sort: "order_ASC" });
    expectTypeOf<"order_asc">().toMatchTypeOf<CmssyRecordSort>();
    expectTypeOf<"-createdAt">().not.toMatchTypeOf<CmssyRecordSort>();
    expectTypeOf<ModelRecordsVariables["sort"]>().toEqualTypeOf<
      CmssyRecordSort | null | undefined
    >();
  });

  it("accepts a validation rule on every field", () => {
    expect(
      fields.text({
        label: "Heading",
        validation: { maxLength: 60, pattern: "slug", message: "Too long" },
      }),
    ).toStrictEqual({
      type: "text",
      label: "Heading",
      validation: { maxLength: 60, pattern: "slug", message: "Too long" },
    });
    expect(
      fields.number({ label: "Price", validation: { min: 0, maxDecimals: 2 } }),
    ).toStrictEqual({
      type: "number",
      label: "Price",
      validation: { min: 0, maxDecimals: 2 },
    });
    fields.richText({ validation: { maxLength: 500 } });
    fields.select({ options: ["a"], validation: { message: "Pick one" } });
    fields.repeater({ itemSchema: {}, validation: { message: "Fix rows" } });
    fields.relation({ model: "post", validation: { message: "Pick posts" } });
    fields.media({ validation: { message: "Add an image" } });
  });

  it("refuses a validation rule spelled wrong", () => {
    const field = fields.text({
      label: "Heading",
      // @ts-expect-error maxLenght is maxLength
      validation: { maxLenght: 60 },
    });
    expect(field.type).toBe("text");
  });

  it("accepts item counts on multiselect, relation and multiple media", () => {
    expect(
      fields.multiselect({ options: ["a", "b"], minItems: 1, maxItems: 2 }),
    ).toStrictEqual({
      type: "multiselect",
      label: "",
      options: ["a", "b"],
      minItems: 1,
      maxItems: 2,
    });
    expect(
      fields.relation({
        model: "post",
        multiple: true,
        minItems: 1,
        maxItems: 3,
      }),
    ).toStrictEqual({
      type: "relation",
      label: "",
      multiple: true,
      minItems: 1,
      maxItems: 3,
      relationTo: "model:post",
      relationType: "hasMany",
      relationMode: "picked",
    });
    expect(
      fields.media({ multiple: true, minItems: 2, maxItems: 6, maxSize: 1024 }),
    ).toStrictEqual({
      type: "media",
      label: "",
      multiple: true,
      minItems: 2,
      maxItems: 6,
      maxSize: 1024,
    });
  });

  it("refuses item counts on a single media field", () => {
    // @ts-expect-error one image has no count to bound
    const field = fields.media({ label: "Logo", maxItems: 3 });
    expect(field.type).toBe("media");
  });

  it("refuses item counts on a field holding one value", () => {
    const field = fields.select({
      options: ["a"],
      // @ts-expect-error a select holds one value
      maxItems: 2,
    });
    expect(field.type).toBe("select");
  });

  it("refuses a media size cap on a field that holds no file", () => {
    const field = fields.text({
      label: "Heading",
      // @ts-expect-error maxSize bounds an upload
      maxSize: 1024,
    });
    expect(field.type).toBe("text");
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

describe("fields.object", () => {
  const image = fields.object({
    label: "Image",
    itemSchema: {
      src: fields.media({ label: "Image" }),
      size: fields.select({ label: "Size", options: ["sm", "lg"] }),
      fullWidth: fields.boolean({ label: "Full width" }),
    },
  });

  it("emits an object field with its sub-fields under itemSchema", () => {
    expect(image.type).toBe("object");
    expect(Object.keys(image.itemSchema ?? {})).toEqual([
      "src",
      "size",
      "fullWidth",
    ]);
    expect(image.itemSchema?.size).toMatchObject({
      type: "select",
      options: ["sm", "lg"],
    });
  });

  it("types the content as the record its sub-fields declare", () => {
    const schema = {
      image,
      cover: fields.object({
        required: true,
        itemSchema: { alt: fields.text({ required: true }) },
      }),
    };
    type Content = InferBlockContent<typeof schema>;

    expectTypeOf<Content>().toEqualTypeOf<{
      cover: { alt: string };
      image?: {
        src?: ResolvedMediaValue<false>;
        size?: "sm" | "lg";
        fullWidth?: boolean;
      };
    }>();
  });

  it("refuses an object without sub-fields and an option it does not have", () => {
    // @ts-expect-error an object field is its sub-fields
    fields.object({ label: "Empty" });
    fields.object({
      itemSchema: {},
      // @ts-expect-error maxItems counts a repeater's rows, an object has one
      maxItems: 2,
    });
  });
});

describe("showWhen", () => {
  it("goes out on the wire as written, on any builder", () => {
    const size = fields.select({
      options: ["sm", "lg"],
      showWhen: { field: "src", notEmpty: true },
    });
    const caption = fields.text({
      showWhen: { field: "fullWidth", equals: false },
    });

    expect(size.showWhen).toEqual({ field: "src", notEmpty: true });
    expect(caption.showWhen).toEqual({ field: "fullWidth", equals: false });
  });

  it("names the sibling it reads", () => {
    fields.text({
      // @ts-expect-error a condition without a field reads nothing
      showWhen: { equals: true },
    });
  });

  it("is accepted by the builders that narrow or rebuild their options", () => {
    const when = { field: "kind", equals: "image" } as const;
    const built = [
      fields.media({ showWhen: when }),
      fields.media({ multiple: true, showWhen: when }),
      fields.relation({ model: "post", showWhen: when }),
      fields.repeater({ itemSchema: {}, showWhen: when }),
      fields.object({ itemSchema: {}, showWhen: when }),
      fields.pageSelector({ showWhen: when }),
      fields.table({ showWhen: when }),
      fields.multiselect({ options: ["a"], showWhen: when }),
    ];
    expect(built.map((field) => field.showWhen)).toEqual(
      built.map(() => when),
    );
  });
});
