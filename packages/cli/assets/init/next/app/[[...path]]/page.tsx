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

// Three lines that decide whether this site is cached at all. Without
// generateStaticParams a catch-all is rendered on demand every time and
// `revalidate` is ignored - the build prints a blank Revalidate column, which is
// the only warning you get. `dynamicParams` keeps pages published after the
// build working: first request renders them, and they cache from then on.
export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return publishedPaths();
}

const CmssyPage = createCmssyPage(cmssy, blocks, { editor: CmssyEditor });

// The header and footer are layout blocks. They are mounted here rather than in
// app/layout.tsx because this route knows its path, and the language prefix in
// that path is what says which language to render them in - reading it from the
// request header instead would make every page dynamic.
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
