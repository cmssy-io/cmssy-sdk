import { createElement } from "react";
import type { BlockMap } from "../registry";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import { resolveBlockAttrs } from "./block-attrs";
import type { CmssyBlockContext } from "./block-context";
import { UnknownBlock } from "./unknown-block";

export interface CmssyBlockProps {
  block: RawBlock;
  locale: string;
  defaultLocale: string;
  blockMap: BlockMap;
  patchedContent?: Record<string, unknown>;
  editable?: boolean;
  layoutPosition?: string;
  context?: CmssyBlockContext;
}

export function CmssyBlock({
  block,
  locale,
  defaultLocale,
  blockMap,
  patchedContent,
  editable,
  layoutPosition,
  context,
}: CmssyBlockProps) {
  const Component = Object.hasOwn(blockMap, block.type)
    ? blockMap[block.type]
    : undefined;
  const attrs = resolveBlockAttrs(block.id, block.style, block.advanced);
  if (attrs.hidden && !editable) return null;
  const base = getBlockContentForLanguage(block.content, locale, defaultLocale);
  const content = patchedContent ? { ...base, ...patchedContent } : base;
  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      data-layout-position={layoutPosition}
      draggable={editable || undefined}
      id={attrs.id}
      className={attrs.className}
      style={Component ? attrs.style : { ...attrs.style, display: "none" }}
    >
      {attrs.css ? (
        <style dangerouslySetInnerHTML={{ __html: attrs.css }} />
      ) : null}
      {Component ? (
        createElement(Component, { content, context })
      ) : (
        <UnknownBlock type={block.type} />
      )}
    </div>
  );
}
