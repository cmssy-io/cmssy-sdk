import { createElement, type ReactNode } from "react";
import type { FieldDefinition } from "@cmssy/types";
import type { BlockMap } from "../registry";
import {
  asBucket,
  getBlockContentForLanguage,
  normalizeRelationContent,
} from "@cmssy/core";
import type { RawBlock } from "@cmssy/core";
import type { CmssyBlockContext } from "@cmssy/core";
import { BlockErrorBoundary } from "@cmssy/react/block-error-boundary";
import { readBlockError, unregisteredBlockError } from "./block-error";
import { BlockErrorCard } from "./block-error-card";
import { UnknownBlock } from "./unknown-block";

export interface CmssyBlockProps {
  block: RawBlock;
  locale: string;
  defaultLocale: string;
  blockMap: BlockMap;
  patchedContent?: Record<string, unknown>;
  patchedStyle?: Record<string, unknown>;
  patchedAdvanced?: Record<string, unknown>;
  /** Server-resolved content for this block (locale flattened, relations resolved). */
  resolvedContent?: Record<string, unknown>;
  /** The block's field schema; lets the client render coerce raw relation values. */
  schema?: Record<string, FieldDefinition>;
  editable?: boolean;
  editMode?: boolean;
  layoutPosition?: string;
  context?: CmssyBlockContext;
  data?: unknown;
}

export function CmssyBlock({
  block,
  locale,
  defaultLocale,
  blockMap,
  patchedContent,
  patchedStyle,
  patchedAdvanced,
  resolvedContent,
  schema,
  editable,
  editMode,
  layoutPosition,
  context,
  data,
}: CmssyBlockProps) {
  const inEditMode = editMode ?? editable ?? false;
  const Component = Object.hasOwn(blockMap, block.type)
    ? blockMap[block.type]
    : undefined;
  const blockError = readBlockError(data);

  const wrap = (children: ReactNode, hidden = false) => (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      data-layout-position={layoutPosition}
      draggable={editable || undefined}
      style={hidden ? { display: "none" } : undefined}
    >
      {children}
    </div>
  );

  if (!Component) {
    return inEditMode
      ? wrap(
          <BlockErrorCard
            blockType={block.type}
            blockId={block.id}
            error={unregisteredBlockError(block.type)}
          />,
        )
      : wrap(<UnknownBlock type={block.type} />, true);
  }

  if (blockError) {
    if (!inEditMode) return null;
    return wrap(
      <BlockErrorCard
        blockType={block.type}
        blockId={block.id}
        error={blockError}
      />,
    );
  }

  const base = resolvedContent
    ? { ...resolvedContent }
    : getBlockContentForLanguage(block.content, locale, defaultLocale);
  const content = patchedContent ? { ...base, ...patchedContent } : base;
  if (schema) normalizeRelationContent(content, schema, resolvedContent);
  const style = patchedStyle
    ? { ...asBucket(block.style), ...patchedStyle }
    : asBucket(block.style);
  const advanced = patchedAdvanced
    ? { ...asBucket(block.advanced), ...patchedAdvanced }
    : asBucket(block.advanced);
  return wrap(
    <BlockErrorBoundary
      blockType={block.type}
      blockId={block.id}
      editMode={inEditMode}
    >
      {createElement(Component, {
        content,
        style,
        advanced,
        context,
        data,
      })}
    </BlockErrorBoundary>,
  );
}
