import type { RawBlock } from "@cmssy/core";
import { getBlockContentForLanguage } from "@cmssy/core/internal";

export function foldBlockContent(
  block: Pick<RawBlock, "content">,
  locale: string,
  defaultLocale: string,
  patchedContent?: Record<string, unknown>,
  resolvedContent?: Record<string, unknown>,
): Record<string, unknown> {
  const base = resolvedContent
    ? { ...resolvedContent }
    : getBlockContentForLanguage(block.content, locale, defaultLocale);
  return patchedContent ? { ...base, ...patchedContent } : base;
}
