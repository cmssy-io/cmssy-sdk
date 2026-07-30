import { cmssySecretsMatch } from "./secret-match";

export const CMSSY_EDIT_HEADER = "x-cmssy-edit";
export const CMSSY_EDIT_QUERY_PARAM = "cmssyEdit";
export const CMSSY_SECRET_QUERY_PARAM = "cmssySecret";

interface EditSearchParams {
  getAll: (name: string) => string[];
  get: (name: string) => string | null;
}

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
