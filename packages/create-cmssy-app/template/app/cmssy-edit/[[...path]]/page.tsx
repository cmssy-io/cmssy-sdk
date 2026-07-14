import { createCmssyEditPage } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

// The route the middleware rewrites a verified editor request onto. The public
// pages stay static, and a static page never sees the query string that would
// put it in edit mode - which is why the editor needs a route of its own.
//
// Delete this file and the editor preview goes blank.
export const dynamic = "force-dynamic";

export default createCmssyEditPage(cmssy, blocks, { editor: CmssyEditor });
