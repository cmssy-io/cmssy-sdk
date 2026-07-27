import {
  createCmssyEditPage,
  CmssyLayoutSlot,
  isCmssyEditMode,
} from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";
import { EditableLayout } from "@/cmssy/editable-layout";

// The route the middleware rewrites a verified editor request onto. The public
// pages stay static, and a static page never sees the query string that would
// put it in edit mode - which is why the editor needs a route of its own.
//
// Delete this file and the editor preview goes blank.
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CmssyEditPage = createCmssyEditPage(cmssy, blocks, {
  editor: CmssyEditor,
});

// The same chrome the public route renders - the editor frames THIS page, so a
// header missing here is a header missing in the editor.
export default async function EditPage(props: PageProps) {
  const { path } = await props.params;

  // Not a hard `true`: this route is reachable directly, and only the proxy's
  // verified rewrite sets the edit header. Hard-coding it would fetch layouts
  // with the draft secret for anyone who typed the URL. Reading a header costs
  // nothing here - the route is force-dynamic either way.
  const editMode = await isCmssyEditMode();

  const slot = (position: "header" | "footer") => (
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
