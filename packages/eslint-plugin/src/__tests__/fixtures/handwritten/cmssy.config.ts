import type { CmssyConfig } from "@cmssy/next";

export const cmssy: CmssyConfig = {
  apiUrl: process.env.CMSSY_API_URL ?? "",
  org: process.env.CMSSY_ORG_SLUG ?? "",
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG ?? "",
  draftSecret: process.env.CMSSY_DRAFT_SECRET ?? "",
};
