import { defineCmssyConfig } from "@cmssy/next";

// Pass process.env raw: defineCmssyConfig validates at startup and names any
// variable you are missing. A `?? ""` fallback would hide that, and the error
// would surface later, somewhere unrelated.
//
// This module reads server env. Never import a VALUE from it (or from a module
// that imports it) in a "use client" component - types are erased, values drag
// process.env into the browser bundle.
export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
});
