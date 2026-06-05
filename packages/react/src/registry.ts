import type { ComponentType } from "react";
import type {
  BlockMeta,
  BlockSchema,
  FieldDefinition,
} from "./bridge/protocol";

export interface RegisterOptions {
  type: string;
  label?: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  props: Record<string, FieldDefinition>;
}

export interface BlockRegistration {
  type: string;
  label: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  component: ComponentType<{ content: Record<string, unknown> }>;
  schema: BlockSchema;
}

export const REGISTRY_KEY = "__cmssy_block_registry__";
type RegistryGlobal = typeof globalThis & {
  [REGISTRY_KEY]?: Map<string, BlockRegistration>;
};
const registryGlobal = globalThis as RegistryGlobal;
if (!registryGlobal[REGISTRY_KEY]) {
  Object.defineProperty(registryGlobal, REGISTRY_KEY, {
    value: new Map<string, BlockRegistration>(),
    enumerable: false,
    writable: false,
    configurable: true,
  });
}
const registry = registryGlobal[REGISTRY_KEY] as Map<string, BlockRegistration>;

export function registerComponent<C extends Record<string, unknown>>(
  component: ComponentType<{ content: C }>,
  options: RegisterOptions,
): void {
  const schema: BlockSchema = {};
  for (const [key, def] of Object.entries(options.props)) {
    schema[key] = { ...def, label: def.label || key };
  }
  registry.set(options.type, {
    type: options.type,
    label: options.label ?? options.type,
    category: options.category,
    icon: options.icon,
    layoutPositions: options.layoutPositions,
    component: component as ComponentType<{
      content: Record<string, unknown>;
    }>,
    schema,
  });
}

export interface BlockDefinition {
  type: string;
  label?: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  props: Record<string, FieldDefinition>;
  component: ComponentType<{ content: Record<string, unknown> }>;
}

export function defineBlock<C extends Record<string, unknown>>(def: {
  type: string;
  label?: string;
  category?: string;
  icon?: string;
  layoutPositions?: string[];
  props: Record<string, FieldDefinition>;
  component: ComponentType<{ content: C }>;
}): BlockDefinition {
  return def as BlockDefinition;
}

export function registerBlocks(
  blocks: BlockDefinition[],
  defaults: { category?: string } = {},
): void {
  for (const block of blocks) {
    registerComponent(block.component, {
      type: block.type,
      label: block.label,
      category: block.category ?? defaults.category,
      icon: block.icon,
      layoutPositions: block.layoutPositions,
      props: block.props,
    });
  }
}

export type BlockMap = Record<
  string,
  ComponentType<{ content: Record<string, unknown> }>
>;

export function buildBlockMap(blocks: BlockDefinition[]): BlockMap {
  const map = Object.create(null) as BlockMap;
  for (const block of blocks) map[block.type] = block.component;
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

export function getRegisteredComponent(
  type: string,
): BlockRegistration | undefined {
  return registry.get(type);
}

export function getRegistry(): ReadonlyMap<string, BlockRegistration> {
  return registry;
}

export function getBlockSchemas(): Record<string, BlockSchema> {
  const out: Record<string, BlockSchema> = {};
  for (const [type, reg] of registry) out[type] = reg.schema;
  return out;
}

export function getBlockMeta(): Record<string, BlockMeta> {
  const out: Record<string, BlockMeta> = {};
  for (const [type, reg] of registry) {
    out[type] = {
      label: reg.label,
      ...(reg.category ? { category: reg.category } : {}),
      ...(reg.icon ? { icon: reg.icon } : {}),
      ...(reg.layoutPositions ? { layoutPositions: reg.layoutPositions } : {}),
    };
  }
  return out;
}

export function clearRegistry(): void {
  registry.clear();
}
