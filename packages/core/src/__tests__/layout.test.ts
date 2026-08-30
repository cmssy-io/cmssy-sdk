import { describe, expect, expectTypeOf, it } from "vitest";
import { defineCmssyConfig, type CmssyRegionOf } from "../config";
import { fields } from "../fields";
import type { LayoutRegion } from "@cmssy/types";
import {
  defineCmssyLayout,
  type CmssyRegion,
  type CmssyRegionSettings,
} from "../layout";

describe("defineCmssyLayout", () => {
  it("returns the regions it was given", () => {
    const layout = defineCmssyLayout({
      regions: [{ id: "header" }, { id: "sidebar_left", label: "Aside" }],
    });
    expect(layout.regions).toEqual([
      { id: "header" },
      { id: "sidebar_left", label: "Aside" },
    ]);
  });

  it("types every region id as its own literal", () => {
    const layout = defineCmssyLayout({
      regions: [{ id: "header" }, { id: "footer" }],
    });
    expectTypeOf<CmssyRegion<typeof layout>>().toEqualTypeOf<
      "header" | "footer"
    >();
    const config = defineCmssyConfig({
      org: "acme",
      workspaceSlug: "acme",
      draftSecret: "shhh",
      layout,
    });
    expectTypeOf<CmssyRegionOf<typeof config>>().toEqualTypeOf<
      "header" | "footer"
    >();
    const bare = defineCmssyConfig({
      org: "acme",
      workspaceSlug: "acme",
      draftSecret: "shhh",
    });
    expectTypeOf<CmssyRegionOf<typeof bare>>().toEqualTypeOf<string>();
  });

  it("refuses an empty declaration", () => {
    expect(() => defineCmssyLayout({ regions: [] })).toThrow(
      /at least one region/,
    );
  });

  it("refuses more than twenty regions", () => {
    const regions = Array.from({ length: 21 }, (_, i) => ({ id: `r${i}` }));
    expect(() => defineCmssyLayout({ regions })).toThrow(/at most 20/);
    expect(() =>
      defineCmssyLayout({ regions: regions.slice(0, 20) }),
    ).not.toThrow();
  });

  it("refuses an id outside the grammar", () => {
    for (const id of ["Header", "_top", "side bar", "a".repeat(51), ""]) {
      expect(() => defineCmssyLayout({ regions: [{ id }] })).toThrow(
        /must match/,
      );
    }
    expect(() =>
      defineCmssyLayout({ regions: [{ id: "a".repeat(50) }, { id: "9-x_y" }] }),
    ).not.toThrow();
  });

  it("carries a region's settings schema through untouched", () => {
    const settings = {
      showOnMobile: fields.boolean({ label: "Show on mobile" }),
      width: fields.number({ required: true }),
    };
    const layout = defineCmssyLayout({
      regions: [{ id: "header" }, { id: "sidebar_left", settings }],
    });
    expect(layout.regions[1].settings).toBe(settings);
    expect("settings" in layout.regions[0]).toBe(false);
  });

  it("types a region's settings values off its schema", () => {
    const layout = defineCmssyLayout({
      regions: [
        { id: "header" },
        {
          id: "sidebar_left",
          settings: {
            showOnMobile: fields.boolean(),
            width: fields.number({ required: true }),
            align: fields.select({ options: ["left", "right"] }),
          },
        },
      ],
    });
    expectTypeOf<
      CmssyRegionSettings<typeof layout, "sidebar_left">
    >().toEqualTypeOf<{
      showOnMobile?: boolean;
      width: number;
      align?: "left" | "right";
    }>();
    expectTypeOf<
      CmssyRegionSettings<typeof layout, "header">
    >().toEqualTypeOf<Record<string, never>>();
  });

  it("distributes over a union of region ids", () => {
    const layout = defineCmssyLayout({
      regions: [
        { id: "header", settings: { sticky: fields.boolean() } },
        { id: "sidebar_left", settings: { width: fields.number() } },
      ],
    });
    type Both = CmssyRegionSettings<typeof layout, "header" | "sidebar_left">;
    expectTypeOf<Both>().toEqualTypeOf<
      { sticky?: boolean } | { width?: number }
    >();
    const sticky: Both = { sticky: true };
    const width: Both = { width: 3 };
    void sticky;
    void width;
  });

  it("resolves a widened layout to no settings at all", () => {
    const regions: LayoutRegion[] = [
      { id: "header", settings: { sticky: fields.boolean() } },
    ];
    const layout = defineCmssyLayout({ regions });
    type Widened = CmssyRegionSettings<typeof layout, "header">;
    expectTypeOf<Widened>().toEqualTypeOf<Record<string, never>>();
    // @ts-expect-error a widened layout promises no settings key
    const anything: Widened = { anything: "goes" };
    void anything;
  });

  it("refuses settings that are not a schema object", () => {
    for (const settings of [null, [], "wide", 3]) {
      expect(() =>
        defineCmssyLayout({
          regions: [
            { id: "header", settings: settings as unknown as undefined },
          ],
        }),
      ).toThrow(/settings must be a fields\.\* schema object/);
    }
  });

  it("refuses a duplicated id", () => {
    expect(() =>
      defineCmssyLayout({ regions: [{ id: "header" }, { id: "header" }] }),
    ).toThrow(/declared twice/);
  });

  it("refuses a blank or oversized label", () => {
    expect(() =>
      defineCmssyLayout({ regions: [{ id: "header", label: "   " }] }),
    ).toThrow(/label must be 1-100/);
    expect(() =>
      defineCmssyLayout({
        regions: [{ id: "header", label: "x".repeat(101) }],
      }),
    ).toThrow(/label must be 1-100/);
    expect(() =>
      defineCmssyLayout({
        regions: [{ id: "header", label: "x".repeat(100) }],
      }),
    ).not.toThrow();
  });
});
