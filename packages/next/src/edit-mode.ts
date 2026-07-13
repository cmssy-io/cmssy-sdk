import { headers } from "next/headers";
import { cmssySecretsMatch } from "./secret-match";

// Middleware forwards this header so server components (the root layout can't
// read searchParams) can detect editor-preview mode on the same signal content
// uses, and fetch draft vs published layouts accordingly.
export const CMSSY_EDIT_HEADER = "x-cmssy-edit";
export const CMSSY_EDIT_QUERY_PARAM = "cmssyEdit";
export const CMSSY_SECRET_QUERY_PARAM = "cmssySecret";

interface EditRequestLike {
  cookies: { has: (name: string) => boolean };
  nextUrl: {
    searchParams: {
      getAll: (name: string) => string[];
      get: (name: string) => string | null;
    };
  };
}

// An edit request is either Next draft mode (cookie set by the authenticated
// /api/draft route) or the editor iframe's `cmssyEdit=1` accompanied by a
// `cmssySecret` matching the site's draft secret. A bare `cmssyEdit=1` is
// NOT trusted - it would let anyone view drafts and mount the editable UI
// (CMS-948).
export async function isCmssyEditRequest(
  request: EditRequestLike,
  config: { draftSecret: string },
): Promise<boolean> {
  if (request.cookies.has("__prerender_bypass")) return true;
  if (
    !request.nextUrl.searchParams.getAll(CMSSY_EDIT_QUERY_PARAM).includes("1")
  ) {
    return false;
  }
  const provided = request.nextUrl.searchParams.get(CMSSY_SECRET_QUERY_PARAM);
  if (!provided || !config.draftSecret) return false;
  return cmssySecretsMatch(provided, config.draftSecret);
}

export async function isCmssyEditMode(): Promise<boolean> {
  const h = await headers();
  return h.get(CMSSY_EDIT_HEADER) === "1";
}
