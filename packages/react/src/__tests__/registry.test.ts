import { describe, it, expect } from "vitest";
import {
  defineBlock,
  buildBlockMap,
  blocksToSchemas,
  blocksToMeta,
} from "../registry";
import { fields } from "../fields";
import { PROTOCOL_VERSION, isProtocolCompatible } from "../bridge/protocol";

const Dummy = () => null;

describe("defineBlock", () => {
  it("returns the definition unchanged and accepts a narrowly-typed content prop", () => {
    const Typed = ({ content }: { content: { heading: string } }) =>
      content.heading;
    const block = defineBlock({
      type: "typed",
      label: "Typed",
      component: Typed,
      props: { heading: fields.singleLine() },
    });
    expect(block.type).toBe("typed");
    expect(block.label).toBe("Typed");
    expect(block.component).toBe(Typed);
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
          kicker: fields.singleLine({ defaultValue: "Nasze usługi" }),
          body: fields.richText({ label: "Treść" }),
        },
      }),
    ]);
    expect(schemas["editorial-intro"]!.kicker?.type).toBe("singleLine");
    expect(schemas["editorial-intro"]!.kicker?.defaultValue).toBe(
      "Nasze usługi",
    );
    expect(schemas["editorial-intro"]!.kicker?.label).toBe("kicker");
    expect(schemas["editorial-intro"]!.body?.label).toBe("Treść");
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
  it("is version 1 and compatibility-checked", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(isProtocolCompatible(1)).toBe(true);
    expect(isProtocolCompatible(2)).toBe(false);
  });
});
