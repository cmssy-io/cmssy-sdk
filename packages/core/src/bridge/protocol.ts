import type {
  FieldType,
  FieldDefinition,
  BlockSchema,
  BlockMeta,
  BlockRect,
} from "@cmssy/types";

export const PROTOCOL_VERSION = 2;

// Schema/geometry shapes live in @cmssy/types (single source of truth);
// re-exported here so the editor-bridge message types below and existing
// consumers keep importing them from this module.
export type { FieldType, FieldDefinition, BlockSchema, BlockMeta, BlockRect };

export interface ReadyMessage {
  type: "cmssy:ready";
  protocolVersion: number;
  blocks: Array<{
    id: string;
    type: string;
    bounds: BlockRect;
    layoutPosition?: string;
  }>;
  schemas: Record<string, BlockSchema>;
  blockMeta?: Record<string, BlockMeta>;
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

export interface DeselectMessage {
  type: "cmssy:deselect";
}

export interface MoveMessage {
  type: "cmssy:move";
  protocolVersion: number;
  blockId: string;
  index: number;
}

export interface DragIndexMessage {
  type: "cmssy:drag-index";
  protocolVersion: number;
  index: number;
}

export type AppToEditorMessage =
  | ReadyMessage
  | BoundsMessage
  | ClickMessage
  | DeselectMessage
  | MoveMessage
  | DragIndexMessage;

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
  style?: Record<string, unknown>;
  advanced?: Record<string, unknown>;
  layoutPosition?: string;
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
  style?: Record<string, unknown>;
  advanced?: Record<string, unknown>;
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

export interface DragOverMessage {
  type: "cmssy:drag-over";
  protocolVersion: number;
  y: number;
}

export interface DragEndMessage {
  type: "cmssy:drag-end";
  protocolVersion: number;
}

export type EditorToAppMessage =
  | SelectMessage
  | PatchMessage
  | ParentReadyMessage
  | InsertMessage
  | ReorderMessage
  | RemoveMessage
  | DragOverMessage
  | DragEndMessage;

export function isProtocolCompatible(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
