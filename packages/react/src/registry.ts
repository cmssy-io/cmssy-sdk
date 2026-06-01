import type { ComponentType } from "react";
import type { BlockSchema, FieldDefinition } from "./bridge/protocol";

export interface RegisterOptions {
  type: string;
  label?: string;
  category?: string;
  props: Record<string, FieldDefinition>;
}

export interface BlockRegistration {
  type: string;
  label: string;
  category?: string;
  component: ComponentType<{ content: Record<string, unknown> }>;
  schema: BlockSchema;
}

const REGISTRY_KEY = "__cmssy_block_registry__";
type RegistryGlobal = typeof globalThis & {
  [REGISTRY_KEY]?: Map<string, BlockRegistration>;
};
const registryGlobal = globalThis as RegistryGlobal;
const registry =
  registryGlobal[REGISTRY_KEY] ??
  (registryGlobal[REGISTRY_KEY] = new Map<string, BlockRegistration>());

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
    component: component as ComponentType<{
      content: Record<string, unknown>;
    }>,
    schema,
  });
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

export function clearRegistry(): void {
  registry.clear();
}
