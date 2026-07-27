// Gateway (pass-through from @cmssy/core)
export { graphqlRequest } from "@cmssy/core";
export type { GraphqlRequestOptions } from "@cmssy/core";
export { CmssyRequestError } from "@cmssy/core";
export type { RetryPolicy } from "@cmssy/core";
export { createCmssyClient, layoutPositionValues } from "@cmssy/core";
export type { LayoutPosition } from "@cmssy/core";
export type {
  CmssyClient,
  CmssyTypedDocument,
  QueryScopedOptions,
} from "@cmssy/core";
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
} from "@cmssy/core";
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
} from "@cmssy/core";

// Blocks / fields
export { fields } from "@cmssy/core";
export type {
  BlockPropsSchema,
  FieldControl,
  InferBlockContent,
  TypedField,
} from "@cmssy/core";
export { defineBlock, buildBlockMap } from "./registry";
export type { BlockDefinition, BlockMap, BlockProps } from "./registry";
export type {
  FieldCondition,
  FieldConditionGroup,
  FieldConditionLogic,
} from "@cmssy/types";
export { buildBlockContext } from "@cmssy/core/internal";
export type {
  CmssyBlockContext,
  CmssyLocaleContext,
  CmssyBlockMember,
  CmssyBlockAuthContext,
  CmssyBlockWorkspace,
  CmssyBlockPage,
  BuildBlockContextExtra,
} from "@cmssy/core";

// Server rendering
export { CmssyServerPage } from "./components/cmssy-server-page";
export type { CmssyServerPageProps } from "./components/cmssy-server-page";
export type {
  EditorBlockData,
  ResolveBlockDataOptions,
  ResolveLayoutBlockDataOptions,
} from "./components/resolve-block-data";
// Editor wiring, which the SDK owns: the canvas renders STORED content, so a
// block's loader has not run and a relation field is still record ids. These
// resolve both halves for it. They lived in /internal-server, which left every
// app reaching into a subpath with no semver promise just to make its header
// editable - while the types were public here all along.
export {
  resolveEditorBlockData,
  resolveEditorLayoutBlockData,
} from "./components/resolve-block-data";
export { CmssyServerLayout } from "./components/cmssy-server-layout";
export type { CmssyServerLayoutProps } from "./components/cmssy-server-layout";
export { CmssyBlock } from "./components/cmssy-block";
export type { CmssyBlockProps } from "./components/cmssy-block";
export { UnknownBlock } from "./components/unknown-block";
export type { UnknownBlockProps } from "./components/unknown-block";

// Editor bridge (protocol)
export { PROTOCOL_VERSION, isProtocolCompatible } from "@cmssy/core";
export { postToEditor, parseEditorMessage, normalizeOrigin } from "@cmssy/core";
export type { PostTarget } from "@cmssy/core";
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
} from "@cmssy/core";
