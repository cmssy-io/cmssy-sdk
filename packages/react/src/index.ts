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
