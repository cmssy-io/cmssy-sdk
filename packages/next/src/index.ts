// The root entry is what every runtime may import: config, constants and types.
// Anything that only works in one place lives where it works -
// @cmssy/next/server (RSC + route handlers), /middleware (edge), /client.
export {
  defineCmssyConfig,
  assertAuthConfig,
  resolveEditorOrigin,
  DEFAULT_CMSSY_EDITOR_ORIGINS,
  CMSSY_EDIT_HEADER,
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  CMSSY_LOCALE_HEADER,
  CMSSY_SESSION_COOKIE,
} from "@cmssy/core";
export type {
  CmssyConfig,
  CmssyEnvConfig,
  CmssyAuthConfig,
  CmssyPageData,
  CmssyPageMeta,
  CmssyPageSummary,
} from "@cmssy/core";

export type {
  CmssyEditorProps,
  CreateCmssyPageOptions,
} from "./create-cmssy-page";
