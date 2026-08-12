import type { CmssyClientConfig, RawBlock } from "../content/content-client";
import {
  asBucket,
  getBlockContentForLanguage,
} from "../content/get-block-content";
import {
  BLOCK_BUCKETS,
  walkBlockFields,
  type BlockBucket,
  type BlockSchemaMap,
} from "./block-content";
import { createCmssyClient, type QueryScopedOptions } from "./client";
import { FORM_QUERY, type CmssyFormDefinition } from "./queries";

/**
 * Finds the forms a page needs by reading the blocks' schemas, so a form field
 * is found under whatever key it was declared with. Reading a fixed `formId`
 * key instead meant `fields.form()` under any other name silently resolved to
 * nothing, and a form field on the style or advanced tab was invisible either
 * way: the editor writes those into their own bucket, not into content.
 */
export function collectFormIds(
  blocks: RawBlock[],
  schemas: BlockSchemaMap,
  locale: string,
  defaultLocale: string,
): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    const schema = schemas[block.type];
    if (!schema) continue;
    const values: Record<BlockBucket, Record<string, unknown>> = {
      content: getBlockContentForLanguage(block.content, locale, defaultLocale),
      style: asBucket(block.style),
      advanced: asBucket(block.advanced),
    };
    for (const bucket of BLOCK_BUCKETS) {
      walkBlockFields(
        values[bucket],
        schema,
        (holder, key, field) => {
          if (field.type !== "form") return;
          const id = holder[key];
          if (typeof id === "string" && id.trim()) ids.add(id);
        },
        { bucket },
      );
    }
  }
  return [...ids];
}

export async function resolveForms(
  config: CmssyClientConfig,
  blocks: RawBlock[],
  schemas: BlockSchemaMap,
  locale: string,
  defaultLocale: string,
  options?: QueryScopedOptions,
): Promise<Record<string, CmssyFormDefinition>> {
  const ids = collectFormIds(blocks, schemas, locale, defaultLocale);
  if (ids.length === 0) return {};

  const client = createCmssyClient(config);
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const data = await client.queryScoped<{
          public: { form: { get: CmssyFormDefinition | null } };
        }>(FORM_QUERY, { formId: id }, options);
        return [id, data.public.form.get] as const;
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn(`[cmssy] failed to resolve form ${id}`, err);
        }
        return [id, null] as const;
      }
    }),
  );

  const forms: Record<string, CmssyFormDefinition> = {};
  for (const [id, def] of entries) {
    if (def) forms[id] = def;
  }
  return forms;
}
