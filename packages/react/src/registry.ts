import type { ComponentType } from "react";
import type { CmssyBlockContext, InferBlockContent } from "@cmssy/core";
import type { BlockPropsSchema, FieldDefinition } from "@cmssy/core";

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
  layoutRegions?: string[];
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
    layoutRegions?: string[];
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

export {
  blocksToMeta,
  blocksToSchemas,
  layoutRegionsToBridge,
  propsToSchema,
} from "@cmssy/core";
