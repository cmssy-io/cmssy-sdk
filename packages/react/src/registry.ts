import type { ComponentType } from "react";
import type { CmssyBlockContext, InferBlockContent } from "@cmssy/core";
import type {
  BlockMeta,
  BlockPropsSchema,
  BlockSchema,
  FieldDefinition,
} from "@cmssy/core";

/**
 * The props a block component receives, derived from the fields it declares:
 *
 *   const props = { headline: fields.text({ required: true }) };
 *   export function Hero({ content }: BlockProps<typeof props>) { … }
 *
 * Type the component this way and the schema is the only place a field is
 * named. Rename `headline` and the component stops compiling, instead of
 * quietly rendering nothing.
 */
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

/** What the component says about the fields the schema declares - nothing else. */
type SchemaSlice<C, Content> = {
  [K in keyof Content]: K extends keyof C ? C[K] : never;
};

/**
 * Rejects a component whose `content` disagrees with the schema about a field
 * the schema declares. Extra keys are fine - a loader may inject content the
 * editor knows nothing about (see `productBlock`) - but a declared field must
 * have the name and the type the schema gives it.
 *
 * Without this, a hand-written content type only had to be *compatible* with the
 * schema, and since every optional field is optional on both sides, a field the
 * component invented was compatible with the one it forgot.
 */
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
  /**
   * One-line semantic description of what the block is and when it belongs on a
   * page. Surfaced to the AI page composer to guide block selection and order.
   */
  description?: string;
  props: Record<string, FieldDefinition>;
  /**
   * Optional server-side data loader. Run by CmssyServerPage during SSR; its
   * result is passed to the component as the `data` prop. Not run in the
   * editor (the component receives `data: undefined` there).
   *
   * The result crosses the server→client boundary when the block component is a
   * Client Component, so it must be RSC-serializable (plain objects, arrays and
   * primitives - no functions, class instances, etc.).
   */
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
      ...(block.description ? { description: block.description } : {}),
    };
  }
  return out;
}
