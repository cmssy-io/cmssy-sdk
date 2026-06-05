import { createElement } from "react";
import type { BlockMap } from "../registry";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import { UnknownBlock } from "./unknown-block";

export interface CmssyBlockProps {
  block: RawBlock;
  locale: string;
  defaultLocale: string;
  blockMap: BlockMap;
  patchedContent?: Record<string, unknown>;
  editable?: boolean;
}

export function CmssyBlock({
  block,
  locale,
  defaultLocale,
  blockMap,
  patchedContent,
  editable,
}: CmssyBlockProps) {
  const Component = Object.hasOwn(blockMap, block.type)
    ? blockMap[block.type]
    : undefined;
  const base = getBlockContentForLanguage(block.content, locale, defaultLocale);
  const content = patchedContent ? { ...base, ...patchedContent } : base;
  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      draggable={editable || undefined}
      style={Component ? undefined : { display: "none" }}
    >
      {Component ? (
        createElement(Component, { content })
      ) : (
        <UnknownBlock type={block.type} />
      )}
    </div>
  );
}
