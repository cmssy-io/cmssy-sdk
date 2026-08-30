import type { ComponentType } from "react";
import type { CmssyBlockContext, InferBlockContent } from "@cmssy/core";
import type {
  BlockMeta,
  BlockPropsSchema,
  BlockSchema,
  FieldDefinition,
  LayoutRegion,
} from "@cmssy/core";

export interface BlockProps<P extends BlockPropsSchema, D = unknown> {
  content: InferBlockContent<P>;
  style?: Record<string, unknown>;
  advanced?: Record<string, unknown>;
  context?: CmssyBlockContext;
  data?: D;
}

type Identical<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

type SchemaSlice<C, Content> = {
  [K in keyof Content]: K extends keyof C ? C[K] : never;
};

type ContentGuard<C, P extends BlockPropsSchema> =
  Identical<
    SchemaSlice<C, InferBlockContent<P>>,
    InferBlockContent<P>
  > extends true
    ? unknown
    : {
        CONTENT_MUST_BE_TYPED_AS_BlockProps_OF_THIS_PROPS: InferBlockContent<P>;
      };

export interface BlockLoaderArgs {
  content: Record<string, unknown>;
  context?: CmssyBlockContext;
}

export type BlockLoader = (args: BlockLoaderArgs) => Promise<unknown> | unknown;

export interface BlockDefinition {
  type: string;
  label?: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  description?: string;
  props: Record<string, FieldDefinition>;
  loader?: BlockLoader;
  component: ComponentType<{
    content: Record<string, unknown>;
    style?: Record<string, unknown>;
    advanced?: Record<string, unknown>;
    context?: CmssyBlockContext;
    data?: unknown;
  }>;
}

export function defineBlock<
  P extends BlockPropsSchema,
  C = InferBlockContent<P>,
  D = unknown,
  S extends Record<string, unknown> = Record<string, unknown>,
  A extends Record<string, unknown> = Record<string, unknown>,
>(
  def: {
    type: string;
    label?: string;
    category?: string;
    icon?: string;
    layoutPositions?: string[];
    description?: string;
    props: P;
    loader?: (args: {
      content: InferBlockContent<P>;
      context?: CmssyBlockContext;
    }) => Promise<D> | D;
    component: ComponentType<{
      content: C;
      style?: S;
      advanced?: A;
      context?: CmssyBlockContext;
      data?: D;
    }>;
  } & ContentGuard<C, P>,
): BlockDefinition {
  return def as unknown as BlockDefinition;
}

export type BlockMap = Record<
  string,
  ComponentType<{
    content: Record<string, unknown>;
    style?: Record<string, unknown>;
    advanced?: Record<string, unknown>;
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

export function propsToSchema(props: BlockPropsSchema): BlockSchema {
  const schema: BlockSchema = {};
  for (const [key, def] of Object.entries(props)) {
    schema[key] = { ...def, label: def.label || key };
  }
  return schema;
}

export function blocksToSchemas(
  blocks: BlockDefinition[],
): Record<string, BlockSchema> {
  const out: Record<string, BlockSchema> = Object.create(null);
  for (const block of blocks) out[block.type] = propsToSchema(block.props);
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
      ...(block.description ? { description: block.description } : {}),
    };
  }
  return out;
}
