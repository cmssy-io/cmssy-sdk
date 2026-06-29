export { fields } from "./fields";
export type { FieldControl } from "./fields";
export {
  defineBlock,
  buildBlockMap,
  blocksToSchemas,
  blocksToMeta,
} from "./registry";
export type { BlockDefinition, BlockMap } from "./registry";
export { CmssyServerPage } from "./components/cmssy-server-page";
export type { CmssyServerPageProps } from "./components/cmssy-server-page";
export { CmssyServerLayout } from "./components/cmssy-server-layout";
export type { CmssyServerLayoutProps } from "./components/cmssy-server-layout";
export { PROTOCOL_VERSION, isProtocolCompatible } from "./bridge/protocol";
export type {
  FieldType,
  FieldDefinition,
  BlockSchema,
  BlockMeta,
  BlockRect,
  ReadyMessage,
  BoundsMessage,
  ClickMessage,
  AppToEditorMessage,
  SelectMessage,
  PatchMessage,
  ParentReadyMessage,
  EditorToAppMessage,
} from "./bridge/protocol";
export {
  postToEditor,
  parseEditorMessage,
  normalizeOrigin,
} from "./bridge/messages";
export type { PostTarget } from "./bridge/messages";

export {
  fetchPage,
  fetchPageById,
  fetchPages,
  fetchPageMeta,
  fetchLayouts,
  normalizeSlug,
} from "./content/content-client";
export type {
  CmssyClientConfig,
  FetchPageOptions,
  FetchLike,
  FetchLikeResponse,
  RawBlock,
  CmssyPageData,
  CmssyPageSummary,
  CmssyPageMeta,
  CmssyLocalizedValue,
  RawLayoutBlock,
  CmssyLayoutGroup,
} from "./content/content-client";
export { getBlockContentForLanguage } from "./content/get-block-content";

export { graphqlRequest } from "./data/graphql-request";
export { fetchSiteConfig, resolveWorkspaceId } from "./data/settings-client";
export type { GraphqlRequestOptions } from "./data/graphql-request";
export { createCmssyClient } from "./data/client";
export type { CmssyClient, QueryScopedOptions } from "./data/client";
export { collectFormIds, resolveForms } from "./data/resolve-forms";
export { resolveSiteLocales, splitLocaleFromPath } from "./data/site-locales";
export type { CmssySiteLocales } from "./data/site-locales";
export {
  localizeHref,
  buildLocaleSwitchHref,
  localizeHtmlLinks,
} from "./data/localize-href";
export {
  SITE_CONFIG_QUERY,
  MODEL_DEFINITIONS_QUERY,
  MODEL_RECORDS_QUERY,
  FORM_QUERY,
  SUBMIT_FORM_MUTATION,
} from "./data/queries";
export type {
  CmssySiteConfig,
  CmssyBranding,
  CmssyModelDefinition,
  CmssyModelRecord,
  CmssyRecordList,
  CmssyFormDefinition,
  CmssyFormField,
  CmssyFormSettings,
  CmssyFormSubmitResponse,
  SubmitFormInput,
} from "./data/queries";

export type {
  CmssyCart,
  CmssyCartItem,
  CmssyCartItemSnapshot,
  CmssyCartDiscount,
  CmssyProduct,
  CmssyProductVariant,
  CmssyOrder,
} from "./commerce/commerce-queries";

export { CmssyBlock } from "./components/cmssy-block";
export type { CmssyBlockProps } from "./components/cmssy-block";
export { buildBlockContext } from "./components/block-context";
export type {
  CmssyBlockContext,
  CmssyLocaleContext,
  CmssyBlockMember,
  CmssyBlockAuthContext,
  CmssyBlockWorkspace,
  BuildBlockContextExtra,
} from "./components/block-context";
export { UnknownBlock } from "./components/unknown-block";
export type { UnknownBlockProps } from "./components/unknown-block";
