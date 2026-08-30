import {
  createCmssyEditPage,
  CmssyLayoutSlot,
  isCmssyEditMode,
} from "@cmssy/next/server";
import type { CmssyRegion } from "@cmssy/next";
import { cmssy, type layout } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";
import { EditableLayout } from "@/cmssy/editable-layout";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CmssyEditPage = createCmssyEditPage(cmssy, blocks, {
  editor: CmssyEditor,
});

export default async function EditPage(props: PageProps) {
  const { path } = await props.params;

  const editMode = await isCmssyEditMode();

  const slot = (position: CmssyRegion<typeof layout>) => (
    <CmssyLayoutSlot
      config={cmssy}
      blocks={blocks}
      position={position}
      path={path ?? []}
      editMode={editMode}
      editable={EditableLayout}
    />
  );

  return (
    <>
      {slot("header")}
      <main>
        <CmssyEditPage {...props} />
      </main>
      {slot("footer")}
    </>
  );
}
