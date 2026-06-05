import { createElement } from "react";
import { getRegisteredComponent, type BlockMap } from "../registry";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import { UnknownBlock } from "./unknown-block";

export interface CmssyBlockProps {
  block: RawBlock;
  locale: string;
  defaultLocale: string;
  patchedContent?: Record<string, unknown>;
  editable?: boolean;
  blockMap?: BlockMap;
}

export function CmssyBlock({
  block,
  locale,
  defaultLocale,
  patchedContent,
  editable,
  blockMap,
}: CmssyBlockProps) {
  const Component = blockMap
    ? Object.hasOwn(blockMap, block.type)
      ? blockMap[block.type]
      : undefined
    : getRegisteredComponent(block.type)?.component;
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
