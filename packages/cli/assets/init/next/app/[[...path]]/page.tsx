import { createCmssyPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";
import { CmssyLayoutSlot } from "@/cmssy/layout-slot";

type PageProps = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CmssyPage = createCmssyPage(cmssy, blocks, { editor: CmssyEditor });

// The header and the footer are layout blocks, mounted here rather than in
// app/layout.tsx: this route knows its path, and the language prefix in that
// path is what says which language to render them in. Reading it from the
// request header instead would make every page dynamic.
export default async function Page(props: PageProps) {
  const { path } = await props.params;
  return (
    <>
      <CmssyLayoutSlot position="header" path={path} />
      <main>
        <CmssyPage {...props} />
      </main>
      <CmssyLayoutSlot position="footer" path={path} />
    </>
  );
}
