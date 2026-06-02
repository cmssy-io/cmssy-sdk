export const PROTOCOL_VERSION = 1;

export type FieldType =
  | "singleLine"
  | "multiLine"
  | "richText"
  | "numeric"
  | "date"
  | "media"
  | "link"
  | "select"
  | "multiselect"
  | "boolean"
  | "color";

export interface FieldDefinition {
  type: FieldType;
  label: string;
  defaultValue?: unknown;
  helperText?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export type BlockSchema = Record<string, FieldDefinition>;

export interface BlockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReadyMessage {
  type: "cmssy:ready";
  protocolVersion: number;
  blocks: Array<{ id: string; type: string; bounds: BlockRect }>;
  schemas: Record<string, BlockSchema>;
}

export interface BoundsMessage {
  type: "cmssy:bounds";
  blockId: string;
  rect: BlockRect;
}

export interface ClickMessage {
  type: "cmssy:click";
  blockId: string;
  rect: BlockRect;
  layoutPosition?: string;
}

export type AppToEditorMessage = ReadyMessage | BoundsMessage | ClickMessage;

export interface SelectMessage {
  type: "cmssy:select";
  protocolVersion: number;
  blockId: string;
}

export interface PatchMessage {
  type: "cmssy:patch";
  protocolVersion: number;
  blockId: string;
  content: Record<string, unknown>;
}

export interface ParentReadyMessage {
  type: "cmssy:parent-ready";
  protocolVersion: number;
}

export interface InsertMessage {
  type: "cmssy:insert";
  protocolVersion: number;
  blockId: string;
  blockType: string;
  content: Record<string, unknown>;
  index: number;
}

export interface ReorderMessage {
  type: "cmssy:reorder";
  protocolVersion: number;
  blockIds: string[];
}

export interface RemoveMessage {
  type: "cmssy:remove";
  protocolVersion: number;
  blockId: string;
}

export type EditorToAppMessage =
  | SelectMessage
  | PatchMessage
  | ParentReadyMessage
  | InsertMessage
  | ReorderMessage
  | RemoveMessage;

export function isProtocolCompatible(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
