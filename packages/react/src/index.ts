export { fields } from "./fields";
export type { FieldControl } from "./fields";
export {
  registerComponent,
  getRegisteredComponent,
  getRegistry,
  getBlockSchemas,
  clearRegistry,
} from "./registry";
export type { RegisterOptions, BlockRegistration } from "./registry";
export { PROTOCOL_VERSION, isProtocolCompatible } from "./bridge/protocol";
export type {
  FieldType,
  FieldDefinition,
  BlockSchema,
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

export { fetchPage, normalizeSlug } from "./content/content-client";
export type {
  CmssyClientConfig,
  FetchPageOptions,
  FetchLike,
  FetchLikeResponse,
  RawBlock,
  CmssyPageData,
} from "./content/content-client";
export { getBlockContentForLanguage } from "./content/get-block-content";

export { CmssyPage } from "./components/cmssy-page";
export type { CmssyPageProps } from "./components/cmssy-page";
export { CmssyBlock } from "./components/cmssy-block";
export type { CmssyBlockProps } from "./components/cmssy-block";
export { UnknownBlock } from "./components/unknown-block";
export type { UnknownBlockProps } from "./components/unknown-block";
