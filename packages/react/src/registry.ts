import type { ComponentType } from "react";
import type { CmssyBlockContext } from "./components/block-context";
import type {
  BlockMeta,
  BlockSchema,
  FieldDefinition,
} from "./bridge/protocol";

export interface BlockLoaderArgs {
  content: Record<string, unknown>;
  context?: CmssyBlockContext;
}

export type BlockLoader = (
  args: BlockLoaderArgs,
) => Promise<unknown> | unknown;

export interface BlockDefinition {
  type: string;
  label?: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  props: Record<string, FieldDefinition>;
  /**
   * Optional server-side data loader. Run by CmssyServerPage during SSR; its
   * result is passed to the component as the `data` prop. Not run in the
   * editor (the component receives `data: undefined` there).
   */
  loader?: BlockLoader;
  component: ComponentType<{
    content: Record<string, unknown>;
    context?: CmssyBlockContext;
    data?: unknown;
  }>;
}

export function defineBlock<
  C extends Record<string, unknown>,
  D = unknown,
>(def: {
  type: string;
  label?: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  props: Record<string, FieldDefinition>;
  loader?: (args: { content: C; context?: CmssyBlockContext }) => Promise<D> | D;
  component: ComponentType<{
    content: C;
    context?: CmssyBlockContext;
    data?: D;
  }>;
}): BlockDefinition {
  return def as BlockDefinition;
}

export type BlockMap = Record<
  string,
  ComponentType<{
    content: Record<string, unknown>;
    context?: CmssyBlockContext;
    data?: unknown;
  }>
>;

export function buildBlockMap(blocks: BlockDefinition[]): BlockMap {
  const map = Object.create(null) as BlockMap;
  for (const block of blocks) map[block.type] = block.component;
  return map;
}

export type LoaderMap = Record<string, BlockLoader | undefined>;

export function buildLoaderMap(blocks: BlockDefinition[]): LoaderMap {
  const map = Object.create(null) as LoaderMap;
  for (const block of blocks) {
    if (block.loader) map[block.type] = block.loader;
  }
  return map;
}

export function blocksToSchemas(
  blocks: BlockDefinition[],
): Record<string, BlockSchema> {
  const out: Record<string, BlockSchema> = Object.create(null);
  for (const block of blocks) {
    const schema: BlockSchema = {};
    for (const [key, def] of Object.entries(block.props)) {
      schema[key] = { ...def, label: def.label || key };
    }
    out[block.type] = schema;
  }
  return out;
}

export function blocksToMeta(
  blocks: BlockDefinition[],
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
    };
  }
  return out;
}
