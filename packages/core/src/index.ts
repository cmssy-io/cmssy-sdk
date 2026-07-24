// @cmssy/core — public surface: the GraphQL gateway, the block/field system,
// and the editor bridge. Anything expressible as a GraphQL query is the app's
// own query (via `graphqlRequest`), not an SDK wrapper. Framework-internal
// plumbing lives on `@cmssy/core/internal`.

// --- Config ---
export { defineCmssyConfig } from "./config";
export { resolveEditorOrigin, DEFAULT_CMSSY_EDITOR_ORIGINS } from "./config";
export type { CmssyConfig, CmssyEnvConfig } from "./config";

// --- Gateway (query/mutation) ---
export { graphqlRequest } from "./data/graphql-request";
export type { GraphqlRequestOptions } from "./data/graphql-request";
export { CmssyRequestError } from "./data/http";
export type { RetryPolicy } from "./data/http";
export { createCmssyClient } from "./data/client";
export type { CmssyClient, QueryScopedOptions } from "./data/client";
export { DEFAULT_CMSSY_API_URL } from "./content/content-client";
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
  CmssyLayoutSettings,
} from "./content/content-client";
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

// --- Blocks / fields ---
export { fields } from "./fields";
export type {
  BlockPropsSchema,
  FieldControl,
  FieldOptions,
  InferBlockContent,
  TypedField,
} from "./fields";
export { evaluateFieldConditionGroup } from "@cmssy/types";
export type {
  FieldCondition,
  FieldConditionGroup,
  FieldConditionLogic,
} from "@cmssy/types";
export type {
  CmssyBlockContext,
  CmssyLocaleContext,
  CmssyBlockMember,
  CmssyBlockAuthContext,
  CmssyBlockWorkspace,
  BuildBlockContextExtra,
} from "./block-context";

// --- Localization (path-prefix helpers) ---
export { localizeHref } from "./data/localize-href";
export { CMSSY_LOCALE_HEADER } from "./locale";

// --- Editor / edit-bridge ---
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
  CMSSY_EDIT_HEADER,
  CMSSY_EDIT_QUERY_PARAM,
  CMSSY_SECRET_QUERY_PARAM,
  isVerifiedEditUrl,
} from "./edit-request";
export { applyCmssyCsp } from "./csp";
export type { CmssyCspOptions } from "./csp";

// --- Webhooks (signature verification — a security primitive, not a query) ---
export { verifyCmssyWebhook, CmssyWebhookError } from "./verify-webhook";
export type {
  CmssyWebhookEvent,
  CmssyWebhookOrder,
  VerifyCmssyWebhookOptions,
} from "./verify-webhook";
