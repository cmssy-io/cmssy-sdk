import { draftMode } from "next/headers";
import { createCmssyPage, CmssyLayoutSlot } from "@cmssy/next/server";
import type { CmssyRegion } from "@cmssy/next";
import { cmssy, type layout } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";
import { EditableLayout } from "@/cmssy/editable-layout";
import { publishedPaths } from "@/services/pages";

type PageProps = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 3600;
export const dynamicParams = true;

const cache = { revalidate };

export function generateStaticParams() {
  return publishedPaths();
}

const CmssyPage = createCmssyPage(cmssy, blocks, {
  editor: CmssyEditor,
  cache,
});

export default async function Page(props: PageProps) {
  const { path } = await props.params;
  const { isEnabled: preview } = await draftMode();
  const slot = (region: CmssyRegion<typeof layout>) => (
    <CmssyLayoutSlot
      config={cmssy}
      blocks={blocks}
      region={region}
      path={path ?? []}
      editMode={false}
      preview={preview}
      editable={EditableLayout}
      cache={cache}
    />
  );

  return (
    <>
      {slot("header")}
      <main>
        <CmssyPage {...props} />
      </main>
      {slot("footer")}
    </>
  );
}
