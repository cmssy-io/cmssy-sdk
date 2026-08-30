import type {
  FieldType,
  FieldDefinition,
  BlockSchema,
  BlockMeta,
  BlockRect,
  LayoutRegion,
} from "@cmssy/types";

export const PROTOCOL_VERSION = 2;

export type { FieldType, FieldDefinition, BlockSchema, BlockMeta, BlockRect };

export const SHORTCUT_ACTIONS = [
  "undo",
  "redo",
  "save",
  "duplicate",
  "delete",
  "escape",
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export interface ReadyMessage {
  type: "cmssy:ready";
  protocolVersion: number;
  blocks: Array<{
    id: string;
    type: string;
    bounds: BlockRect;
    layoutRegion?: string;
  }>;
  schemas: Record<string, BlockSchema>;
  blockMeta?: Record<string, BlockMeta>;
  capabilities?: string[];
  layoutRegions?: LayoutRegion[];
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
  layoutRegion?: string;
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

export interface ShortcutMessage {
  type: "cmssy:shortcut";
  protocolVersion: number;
  action: ShortcutAction;
}

export interface InvisibleBlock {
  blockId: string;
  blockType: string;
}

export interface InvisibleBlocksMessage {
  type: "cmssy:invisible-blocks";
  protocolVersion: number;
  blocks: InvisibleBlock[];
}

export type AppToEditorMessage =
  | ReadyMessage
  | BoundsMessage
  | ClickMessage
  | DeselectMessage
  | MoveMessage
  | DragIndexMessage
  | ShortcutMessage
  | InvisibleBlocksMessage;

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
  layoutRegion?: string;
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

export interface ViewportMessage {
  type: "cmssy:viewport";
  protocolVersion: number;
  width: number;
  height: number;
}

export type EditorToAppMessage =
  | SelectMessage
  | PatchMessage
  | ParentReadyMessage
  | InsertMessage
  | ReorderMessage
  | RemoveMessage
  | DragOverMessage
  | DragEndMessage
  | ViewportMessage;

export function isProtocolCompatible(version: number): boolean {
  return version === PROTOCOL_VERSION;
}
