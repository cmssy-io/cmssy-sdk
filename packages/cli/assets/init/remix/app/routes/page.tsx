import {
  CmssyBlock,
  buildBlockContext,
  buildBlockMap,
  resolveEditorBlockData,
  resolveEditorLayoutBlockData,
  type EditorBlockData,
  type ResolveLayoutBlockDataOptions,
} from "@cmssy/react";
import { createCmssyHeaders, createCmssyLoader } from "@cmssy/remix";
import { cmssy } from "../../cmssy.config";
import { blocks } from "../cmssy/blocks";
import { CmssyEditor } from "../cmssy/editor";
import { LayoutSlot } from "../cmssy/layout-slot";
import type { Route } from "./+types/page";

const cmssyLoader = createCmssyLoader(cmssy, { blocks });

type Position = "header" | "footer";

async function resolveSlot(
  options: Omit<ResolveLayoutBlockDataOptions, "position">,
  position: Position,
) {
  const resolved = await resolveEditorLayoutBlockData({ ...options, position });
  return { data: resolved.data, resolvedContent: resolved.content };
}

export async function loader(args: Route.LoaderArgs) {
  const data = await cmssyLoader(args);
  const resolved: EditorBlockData = data.isEdit
    ? { data: {}, content: {} }
    : await resolveEditorBlockData({
        page: data.page,
        blocks,
        locale: data.locale,
        defaultLocale: data.defaultLocale,
        enabledLocales: data.enabledLocales,
        config: cmssy,
      });

  const slotOptions = {
    groups: data.layouts,
    blocks,
    locale: data.locale,
    defaultLocale: data.defaultLocale,
    enabledLocales: data.enabledLocales,
    config: cmssy,
  };
  const [header, footer] = data.isEdit
    ? [data.editorData?.header, data.editorData?.footer]
    : await Promise.all([
        resolveSlot(slotOptions, "header"),
        resolveSlot(slotOptions, "footer"),
      ]);

  return {
    ...data,
    blockData: resolved.data,
    blockContent: resolved.content,
    layoutData: { header, footer },
  };
}

export const headers = createCmssyHeaders(cmssy);

export default function CmssyPage({ loaderData }: Route.ComponentProps) {
  const {
    page,
    layouts,
    locale,
    defaultLocale,
    enabledLocales,
    isEdit,
    editorOrigin,
    diagnostics,
    layoutData,
    blockData,
    blockContent,
  } = loaderData;

  if (diagnostics) {
    return <div dangerouslySetInnerHTML={{ __html: diagnostics }} />;
  }

  const slot = (position: Position) => (
    <LayoutSlot
      groups={layouts}
      position={position}
      locale={locale}
      defaultLocale={defaultLocale}
      enabledLocales={enabledLocales}
      edit={isEdit ? { editorOrigin } : undefined}
      data={layoutData[position]?.data}
      resolvedContent={layoutData[position]?.resolvedContent}
    />
  );

  if (isEdit) {
    return (
      <>
        {slot("header")}
        <CmssyEditor
          page={page}
          locale={locale}
          defaultLocale={defaultLocale}
          enabledLocales={enabledLocales}
          edit={{ editorOrigin }}
        />
        {slot("footer")}
      </>
    );
  }

  if (!page)
    return (
      <>
        {slot("header")}
        <main>
          <h1>Not found</h1>
        </main>
        {slot("footer")}
      </>
    );

  const blockMap = buildBlockMap(blocks);
  const context = buildBlockContext(locale, defaultLocale, enabledLocales);

  return (
    <>
      {slot("header")}
      <main>
        {(page.blocks ?? []).map((block) => (
          <CmssyBlock
            key={block.id}
            block={block}
            blockMap={blockMap}
            locale={locale}
            defaultLocale={defaultLocale}
            context={context}
            resolvedContent={blockContent[block.id]}
            data={blockData[block.id]}
          />
        ))}
      </main>
      {slot("footer")}
    </>
  );
}
