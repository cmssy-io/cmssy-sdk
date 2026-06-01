import { describe, it, expect, beforeEach } from "vitest";
import {
  registerComponent,
  getRegisteredComponent,
  getBlockSchemas,
  clearRegistry,
} from "../registry";
import { fields } from "../fields";
import { PROTOCOL_VERSION, isProtocolCompatible } from "../bridge/protocol";

const Dummy = () => null;

describe("registry", () => {
  beforeEach(() => clearRegistry());

  it("registers a component with a field schema (editorial-intro shape)", () => {
    registerComponent(Dummy, {
      type: "editorial-intro",
      label: "Editorial Intro",
      category: "marketing",
      props: {
        kicker: fields.singleLine({ defaultValue: "Nasze usługi" }),
        body: fields.richText(),
        image: fields.media(),
        ctaHref: fields.link(),
      },
    });
    const reg = getRegisteredComponent("editorial-intro");
    expect(reg?.label).toBe("Editorial Intro");
    expect(reg?.category).toBe("marketing");
    expect(reg?.schema.kicker?.type).toBe("singleLine");
    expect(reg?.schema.kicker?.defaultValue).toBe("Nasze usługi");
    expect(reg?.schema.body?.type).toBe("richText");
    expect(reg?.schema.image?.type).toBe("media");
    expect(reg?.schema.ctaHref?.type).toBe("link");
  });

  it("defaults a field label to its key when omitted", () => {
    registerComponent(Dummy, {
      type: "x",
      props: { heading: fields.singleLine() },
    });
    expect(getRegisteredComponent("x")?.schema.heading?.label).toBe("heading");
  });

  it("keeps an explicit field label", () => {
    registerComponent(Dummy, {
      type: "y",
      props: { heading: fields.singleLine({ label: "Title" }) },
    });
    expect(getRegisteredComponent("y")?.schema.heading?.label).toBe("Title");
  });

  it("defaults the block label to its type", () => {
    registerComponent(Dummy, { type: "footer", props: {} });
    expect(getRegisteredComponent("footer")?.label).toBe("footer");
  });

  it("exposes all schemas for the bridge ready payload", () => {
    registerComponent(Dummy, { type: "a", props: { t: fields.singleLine() } });
    registerComponent(Dummy, { type: "b", props: { n: fields.numeric() } });
    const schemas = getBlockSchemas();
    expect(Object.keys(schemas).sort()).toEqual(["a", "b"]);
    expect(schemas.a?.t?.type).toBe("singleLine");
  });
});

describe("protocol", () => {
  it("is version 1 and compatibility-checked", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(isProtocolCompatible(1)).toBe(true);
    expect(isProtocolCompatible(2)).toBe(false);
  });
});
