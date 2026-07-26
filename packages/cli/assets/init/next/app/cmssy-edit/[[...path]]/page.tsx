import { createCmssyEditPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";
import { CmssyLayoutSlot } from "@/cmssy/layout-slot";

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
  return (
    <>
      <CmssyLayoutSlot position="header" path={path} />
      <main>
        <CmssyEditPage {...props} />
      </main>
      <CmssyLayoutSlot position="footer" path={path} />
    </>
  );
}
