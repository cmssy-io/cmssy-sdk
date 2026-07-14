import { CmssyBlock, buildBlockContext, buildBlockMap } from "@cmssy/react";
import { createCmssyHeaders, createCmssyLoader } from "@cmssy/remix";
import { cmssy } from "../../cmssy.config";
import { blocks } from "../cmssy/blocks";
import { CmssyEditor } from "../cmssy/editor";
import type { Route } from "./+types/page";

export const loader = createCmssyLoader(cmssy);

// Without these the admin cannot frame the site, and the editor shows an empty
// box with no error anywhere.
export const headers = createCmssyHeaders(cmssy);

export default function CmssyPage({ loaderData }: Route.ComponentProps) {
  const { page, locale, defaultLocale, enabledLocales, isEdit, editorOrigin } =
    loaderData;

  // A verified editor request renders the same page through the edit bridge.
  // No separate route: a React Router page always sees its query string.
  if (isEdit) {
    return (
      <CmssyEditor
        page={page}
        locale={locale}
        defaultLocale={defaultLocale}
        enabledLocales={enabledLocales}
        edit={{ editorOrigin }}
      />
    );
  }

  if (!page) return <main><h1>Not found</h1></main>;

  const blockMap = buildBlockMap(blocks);
  const context = buildBlockContext(locale, defaultLocale, enabledLocales);

  return (
    <main>
      {(page.blocks ?? []).map((block) => (
        <CmssyBlock
          key={block.id}
          block={block}
          blockMap={blockMap}
          locale={locale}
          defaultLocale={defaultLocale}
          context={context}
        />
      ))}
    </main>
  );
}
