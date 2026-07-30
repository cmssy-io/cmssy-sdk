export {
  defineCmssyConfig,
  resolveEditorOrigin,
  DEFAULT_CMSSY_EDITOR_ORIGINS,
  CMSSY_EDIT_HEADER,
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  localizeHref,
  CMSSY_LOCALE_HEADER,
} from "@cmssy/core";
export type {
  CmssyConfig,
  CmssyEnvConfig,
  CmssyPageData,
  CmssyPageMeta,
  CmssyPageSummary,
} from "@cmssy/core";

export type {
  CmssyEditorProps,
  CreateCmssyPageOptions,
  CmssyAppContext,
} from "./create-cmssy-page";
