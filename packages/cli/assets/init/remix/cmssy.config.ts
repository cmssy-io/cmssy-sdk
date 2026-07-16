import { defineCmssyConfig } from "@cmssy/remix";

// Pass the env raw: a `?? ""` fallback turns a missing variable into an empty
// one, and the error then surfaces somewhere unrelated.
export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
});
