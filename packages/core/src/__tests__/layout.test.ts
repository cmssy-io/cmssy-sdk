import { describe, expect, expectTypeOf, it } from "vitest";
import { defineCmssyConfig, type CmssyRegionOf } from "../config";
import { defineCmssyLayout, type CmssyRegion } from "../layout";

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
