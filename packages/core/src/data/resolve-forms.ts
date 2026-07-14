import type { CmssyClientConfig, RawBlock } from "../content/content-client";
import { getBlockContentForLanguage } from "../content/get-block-content";
import { createCmssyClient, type QueryScopedOptions } from "./client";
import { FORM_QUERY, type CmssyFormDefinition } from "./queries";

export function collectFormIds(
  blocks: RawBlock[],
  locale: string,
  defaultLocale: string,
): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    const content = getBlockContentForLanguage(
      block.content,
      locale,
      defaultLocale,
    );
    const formId = content.formId;
    if (typeof formId === "string" && formId.trim()) ids.add(formId);
  }
  return [...ids];
}

export async function resolveForms(
  config: CmssyClientConfig,
  blocks: RawBlock[],
  locale: string,
  defaultLocale: string,
  options?: QueryScopedOptions,
): Promise<Record<string, CmssyFormDefinition>> {
  const ids = collectFormIds(blocks, locale, defaultLocale);
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
