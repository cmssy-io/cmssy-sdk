import { cmssySecretsMatch } from "./secret-match";

// Middleware forwards this header so server components (the root layout can't
// read searchParams) can detect editor-preview mode on the same signal content
// uses, and fetch draft vs published layouts accordingly.
export const CMSSY_EDIT_HEADER = "x-cmssy-edit";
export const CMSSY_EDIT_QUERY_PARAM = "cmssyEdit";
export const CMSSY_SECRET_QUERY_PARAM = "cmssySecret";

interface EditSearchParams {
  getAll: (name: string) => string[];
  get: (name: string) => string | null;
}

// The editor iframe asks for edit mode with `cmssyEdit=1`, and proves it is the
// editor with a `cmssySecret` matching the site's draft secret. A bare
// `cmssyEdit=1` is NOT trusted - it would let anyone read drafts and mount the
// editable UI (CMS-948).
export async function isVerifiedEditUrl(
  url: { searchParams: EditSearchParams },
  config: { draftSecret: string },
): Promise<boolean> {
  if (!url.searchParams.getAll(CMSSY_EDIT_QUERY_PARAM).includes("1")) {
    return false;
  }
  const provided = url.searchParams.get(CMSSY_SECRET_QUERY_PARAM);
  if (!provided || !config.draftSecret) return false;
  return cmssySecretsMatch(provided, config.draftSecret);
}
