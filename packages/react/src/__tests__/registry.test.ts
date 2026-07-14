import { describe, it, expect, expectTypeOf } from "vitest";
import {
  defineBlock,
  buildBlockMap,
  blocksToSchemas,
  blocksToMeta,
  type BlockProps,
} from "../registry";
import { fields } from "@cmssy/core";
import { PROTOCOL_VERSION, isProtocolCompatible } from "@cmssy/core";

const Dummy = () => null;

describe("defineBlock", () => {
  it("returns the definition unchanged", () => {
    const props = { heading: fields.text({ required: true }) };
    const Typed = ({ content }: BlockProps<typeof props>) =>
      content.heading;

    const block = defineBlock({
      type: "typed",
      label: "Typed",
      props,
      component: Typed,
    });

    expect(block.type).toBe("typed");
    expect(block.label).toBe("Typed");
    expect(block.component).toBe(Typed);
  });
});

/**
 * The point of the whole thing. Every assertion below is checked by
 * `tsc --noEmit`, not by vitest: a missing error is a failed build, which is
 * the only way to prove that a mistake in a schema cannot reach production.
 *
 * Before typed fields, a block whose schema said `headline` and whose component
 * read `content.heading` compiled clean and rendered an empty block.
 */
describe("the schema types the content", () => {
  it("gives a required field a required key, and everything else an optional one", () => {
    const props = {
      headline: fields.text({ required: true }),
      subtitle: fields.text(),
      columns: fields.number(),
      featured: fields.boolean(),
    };

    expectTypeOf<BlockProps<typeof props>["content"]>().toEqualTypeOf<{
      headline: string;
      subtitle?: string;
      columns?: number;
      featured?: boolean;
    }>();
  });

  it("narrows a select to its own options, and a media field by `multiple`", () => {
    const props = {
      align: fields.select({ options: ["left", "center"], required: true }),
      tags: fields.multiselect({ options: ["new", "sale"], required: true }),
      cover: fields.media({ required: true }),
      gallery: fields.media({ multiple: true, required: true }),
    };
    type Content = BlockProps<typeof props>["content"];

    expectTypeOf<Content["align"]>().toEqualTypeOf<"left" | "center">();
    expectTypeOf<Content["tags"]>().toEqualTypeOf<("new" | "sale")[]>();
    expectTypeOf<Content["cover"]>().toEqualTypeOf<string>();
    expectTypeOf<Content["gallery"]>().toEqualTypeOf<string[]>();
  });

  it("gives a repeater the shape of one row", () => {
    const props = {
      items: fields.repeater({
        required: true,
        itemSchema: {
          label: fields.text({ required: true }),
          href: fields.url(),
        },
      }),
    };
    type Content = BlockProps<typeof props>["content"];

    expectTypeOf<Content["items"]>().toEqualTypeOf<
      { label: string; href?: string }[]
    >();
  });

  it("REJECTS a component that reads a field the schema does not declare", () => {
    const props = { headline: fields.text({ required: true }) };

    const Renamed = ({ content }: BlockProps<typeof props>) =>
      // @ts-expect-error - the schema says `headline`; there is no `heading`.
      content.heading;

    expect(Renamed).toBeTypeOf("function");
  });

  it("REJECTS a hand-written content type that has drifted from the schema", () => {
    const props = {
      headline: fields.text({ required: true }),
      subtitle: fields.text(),
    };
    // The old two-sources-of-truth shape: compatible with the schema (they share
    // `subtitle`), so plain structural assignability let it through.
    const Drifted = ({
      content,
    }: {
      content: { heading?: string; subtitle?: string };
    }) => content.heading ?? content.subtitle;

    // @ts-expect-error - content must be derived from props, not retyped beside it.
    const block = defineBlock({ type: "drifted", props, component: Drifted });

    expect(block.type).toBe("drifted");
  });

  it("REJECTS a loader that reads a field the schema does not declare", () => {
    const props = { slug: fields.text({ required: true }) };

    defineBlock({
      type: "loaded",
      props,
      // @ts-expect-error - `category` is not in the schema.
      loader: ({ content }) => Promise.resolve(content.category),
      component: Dummy,
    });
  });
});

describe("buildBlockMap", () => {
  it("maps type → component", () => {
    const hero = defineBlock({ type: "hero", component: Dummy, props: {} });
    const footer = defineBlock({ type: "footer", component: Dummy, props: {} });
    const map = buildBlockMap([hero, footer]);
    expect(map.hero).toBe(Dummy);
    expect(map.footer).toBe(Dummy);
  });

  it("is null-prototype so a CMS type like __proto__/toString can't resolve to a prototype member", () => {
    const map = buildBlockMap([
      defineBlock({ type: "hero", component: Dummy, props: {} }),
    ]);
    expect(Object.getPrototypeOf(map)).toBeNull();
    expect(map["toString"]).toBeUndefined();
    expect(map["__proto__"]).toBeUndefined();
  });
});

describe("blocksToSchemas", () => {
  it("derives a schema per block and defaults a field label to its key", () => {
    const schemas = blocksToSchemas([
      defineBlock({
        type: "editorial-intro",
        component: Dummy,
        props: {
          kicker: fields.text({ defaultValue: "Our services" }),
          body: fields.richText({ label: "Body" }),
        },
      }),
    ]);
    expect(schemas["editorial-intro"]!.kicker?.type).toBe("text");
    expect(schemas["editorial-intro"]!.kicker?.defaultValue).toBe(
      "Our services",
    );
    expect(schemas["editorial-intro"]!.kicker?.label).toBe("kicker");
    expect(schemas["editorial-intro"]!.body?.label).toBe("Body");
  });

  it("is null-prototype", () => {
    const schemas = blocksToSchemas([
      defineBlock({ type: "hero", component: Dummy, props: {} }),
    ]);
    expect(Object.getPrototypeOf(schemas)).toBeNull();
  });
});

describe("blocksToMeta", () => {
  it("derives label/category/icon/layoutPositions and applies the default category", () => {
    const meta = blocksToMeta(
      [
        defineBlock({
          type: "site-header",
          label: "Site Header",
          icon: "layout-panel-top",
          layoutPositions: ["header"],
          component: Dummy,
          props: {},
        }),
        defineBlock({
          type: "hero",
          label: "Hero",
          component: Dummy,
          props: {},
        }),
      ],
      { category: "kancelaria" },
    );
    expect(meta["site-header"]).toEqual({
      label: "Site Header",
      category: "kancelaria",
      icon: "layout-panel-top",
      layoutPositions: ["header"],
    });
    expect(meta.hero).toEqual({ label: "Hero", category: "kancelaria" });
  });

  it("lets a block override the default category and defaults the label to the type", () => {
    const meta = blocksToMeta(
      [
        defineBlock({
          type: "special",
          category: "custom",
          component: Dummy,
          props: {},
        }),
      ],
      { category: "kancelaria" },
    );
    expect(meta.special).toEqual({ label: "special", category: "custom" });
  });

  it("emits description when the block defines it", () => {
    const meta = blocksToMeta([
      defineBlock({
        type: "hero",
        label: "Hero",
        description: "Full-width banner; first block on a page.",
        component: Dummy,
        props: {},
      }),
    ]);
    expect(meta.hero).toEqual({
      label: "Hero",
      description: "Full-width banner; first block on a page.",
    });
  });

  it("is null-prototype", () => {
    const meta = blocksToMeta([
      defineBlock({ type: "hero", component: Dummy, props: {} }),
    ]);
    expect(Object.getPrototypeOf(meta)).toBeNull();
  });
});

describe("protocol", () => {
  it("is version 2 and compatibility-checked", () => {
    expect(PROTOCOL_VERSION).toBe(2);
    expect(isProtocolCompatible(2)).toBe(true);
    expect(isProtocolCompatible(1)).toBe(false);
  });
});
