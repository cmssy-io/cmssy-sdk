import type { LayoutRegion } from "@cmssy/types";

import type {
  BlockMeta,
  BlockSchema,
  FieldDefinition,
} from "./bridge/protocol";
import type { BlockPropsSchema } from "./fields";

export interface BlockManifestSource {
  type: string;
  label?: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  description?: string;
  props: Record<string, FieldDefinition>;
}

export interface BlockManifestBlock {
  type: string;
  label: string;
  category?: string;
  icon?: string;
  description?: string;
  layoutPositions?: string[];
  schema: BlockSchema;
}

export interface BlockManifest {
  blocks: BlockManifestBlock[];
  regions: LayoutRegion[] | null;
}

export function propsToSchema(props: BlockPropsSchema): BlockSchema {
  const schema: BlockSchema = {};
  for (const [key, def] of Object.entries(props)) {
    schema[key] = { ...def, label: def.label || key };
  }
  return schema;
}

export function blocksToSchemas(
  blocks: readonly BlockManifestSource[],
): Record<string, BlockSchema> {
  const out: Record<string, BlockSchema> = Object.create(null);
  for (const block of blocks) out[block.type] = propsToSchema(block.props);
  return out;
}

export function blocksToMeta(
  blocks: readonly BlockManifestSource[],
  defaults: { category?: string } = {},
): Record<string, BlockMeta> {
  const out: Record<string, BlockMeta> = Object.create(null);
  for (const block of blocks) {
    const category = block.category ?? defaults.category;
    out[block.type] = {
      label: block.label ?? block.type,
      ...(category ? { category } : {}),
      ...(block.icon ? { icon: block.icon } : {}),
      ...(block.layoutPositions
        ? { layoutPositions: block.layoutPositions }
        : {}),
      ...(block.description ? { description: block.description } : {}),
    };
  }
  return out;
}

export function layoutRegionsToBridge(
  regions: readonly LayoutRegion[],
): LayoutRegion[] {
  return regions.map((region) =>
    region.settings
      ? { ...region, settings: propsToSchema(region.settings) }
      : { ...region },
  );
}

export function registryToManifestBlocks(
  schemas: Record<string, BlockSchema>,
  blockMeta: Record<string, BlockMeta> | null,
): BlockManifestBlock[] {
  return Object.entries(schemas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, schema]) => {
      const meta = blockMeta?.[type];
      return {
        type,
        label: meta?.label || type,
        ...(meta?.category ? { category: meta.category } : {}),
        ...(meta?.icon ? { icon: meta.icon } : {}),
        ...(meta?.description ? { description: meta.description } : {}),
        ...(meta?.layoutPositions?.length
          ? { layoutPositions: meta.layoutPositions }
          : {}),
        schema,
      };
    });
}

export function buildBlockManifest(
  blocks: readonly BlockManifestSource[],
  options: { category?: string; regions?: readonly LayoutRegion[] | null } = {},
): BlockManifest {
  return {
    blocks: registryToManifestBlocks(
      blocksToSchemas(blocks),
      blocksToMeta(blocks, { category: options.category }),
    ),
    regions: options.regions ? layoutRegionsToBridge(options.regions) : null,
  };
}
