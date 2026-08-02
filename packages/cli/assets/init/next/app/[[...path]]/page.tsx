import { createCmssyPage, CmssyLayoutSlot } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
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

export function generateStaticParams() {
  return publishedPaths();
}

const CmssyPage = createCmssyPage(cmssy, blocks, { editor: CmssyEditor });

export default async function Page(props: PageProps) {
  const { path } = await props.params;
  const slot = (position: "header" | "footer") => (
    <CmssyLayoutSlot
      config={cmssy}
      blocks={blocks}
      position={position}
      path={path ?? []}
      editMode={false}
      editable={EditableLayout}
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
