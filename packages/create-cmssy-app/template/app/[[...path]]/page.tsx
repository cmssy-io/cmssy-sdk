import { buildCmssyMetadata, createCmssyPage } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

type PageProps = { params: Promise<{ path?: string[] }> };

export async function generateMetadata({ params }: PageProps) {
  const { path } = await params;
  // As routed, prefix and all: the prefix IS the language. Strip it and every
  // translated page gets the default language's title - and a canonical
  // pointing at the default language's URL, which reads as "duplicate".
  return buildCmssyMetadata(cmssy, path);
}

export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
