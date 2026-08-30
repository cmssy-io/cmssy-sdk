import { describe, expect, it } from "vitest";

import { fields } from "../fields";
import { defineCmssyLayout } from "../layout";
import {
  blocksToMeta,
  blocksToSchemas,
  buildBlockManifest,
  layoutRegionsToBridge,
  registryToManifestBlocks,
} from "../manifest";

const hero = {
  type: "hero",
  label: "Hero",
  icon: "sparkles",
  description: "Top of page",
  props: {
    title: fields.text({ required: true }),
    subtitle: fields.textarea({ label: "Subtitle" }),
  },
};

const header = {
  type: "header",
  layoutRegions: ["header"],
  props: { logo: fields.media() },
};

const layout = defineCmssyLayout({
  regions: [
    { id: "header", label: "Header" },
    {
      id: "sidebar_left",
      label: "Aside",
      settings: {
        width: fields.number({ required: true }),
        sticky: fields.boolean({ label: "Sticky" }),
      },
    },
  ],
});

describe("buildBlockManifest", () => {
  it("serializes blocks with the schemas and meta the handshake sends, byte for byte", () => {
    const manifest = buildBlockManifest([hero, header], {
      category: "Site",
      regions: layout.regions,
    });

    const schemas = blocksToSchemas([hero, header]);
    for (const block of manifest.blocks) {
      expect(JSON.stringify(block.schema)).toBe(
        JSON.stringify(schemas[block.type]),
      );
    }
    expect(JSON.stringify(manifest.regions)).toBe(
      JSON.stringify(layoutRegionsToBridge(layout.regions)),
    );
    expect(manifest.blocks).toStrictEqual(
      registryToManifestBlocks(
        schemas,
        blocksToMeta([hero, header], { category: "Site" }),
      ),
    );
  });

  it("folds meta into the block the way the admin stores it: sorted by type, label falling back to the type, empty extras dropped", () => {
    const manifest = buildBlockManifest([hero, header]);

    expect(manifest.blocks).toStrictEqual([
      {
        type: "header",
        label: "header",
        layoutRegions: ["header"],
        schema: { logo: { ...fields.media(), label: "logo" } },
      },
      {
        type: "hero",
        label: "Hero",
        icon: "sparkles",
        description: "Top of page",
        schema: {
          title: { ...fields.text({ required: true }), label: "title" },
          subtitle: {
            ...fields.textarea({ label: "Subtitle" }),
            label: "Subtitle",
          },
        },
      },
    ]);
    expect(manifest.regions).toBeNull();
  });

  it("orders blocks by locale, not by code point - a lowercase type sorts before an uppercase one", () => {
    const manifest = buildBlockManifest([
      { type: "Banner", props: {} },
      { type: "aside", props: {} },
    ]);

    expect(manifest.blocks.map((block) => block.type)).toEqual([
      "aside",
      "Banner",
    ]);
  });

  it("applies the registry-wide category only to blocks without their own", () => {
    const manifest = buildBlockManifest(
      [hero, { ...header, category: "Layout" }],
      { category: "Site" },
    );

    expect(
      manifest.blocks.map((block) => [block.type, block.category]),
    ).toEqual([
      ["header", "Layout"],
      ["hero", "Site"],
    ]);
  });

  it("labels every region setting the way block props are labelled", () => {
    const manifest = buildBlockManifest([hero], { regions: layout.regions });

    expect(manifest.regions).toStrictEqual([
      { id: "header", label: "Header" },
      {
        id: "sidebar_left",
        label: "Aside",
        settings: {
          width: { ...fields.number({ required: true }), label: "width" },
          sticky: { ...fields.boolean({ label: "Sticky" }), label: "Sticky" },
        },
      },
    ]);
  });

  it("drops a layoutRegions list that is empty", () => {
    const manifest = buildBlockManifest([{ ...header, layoutRegions: [] }]);

    expect(manifest.blocks[0]).not.toHaveProperty("layoutRegions");
  });
});
