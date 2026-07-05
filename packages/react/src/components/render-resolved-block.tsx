import { createElement } from "react";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import type { BlockMap } from "../registry";
import { resolveBlockAttrs } from "./block-attrs";
import type { CmssyBlockContext } from "./block-context";
import { UnknownBlock } from "./unknown-block";

export interface RenderResolvedBlockOptions {
  context?: CmssyBlockContext;
  /** Loader result, passed to the component as the `data` prop. */
  data?: unknown;
  /** Pre-resolved localized content; skips re-resolution when provided. */
  resolvedContent?: Record<string, unknown>;
  enabledLocales?: string[];
}

export function renderResolvedBlock(
  block: RawBlock,
  map: BlockMap,
  locale: string,
  defaultLocale: string,
  options: RenderResolvedBlockOptions = {},
) {
  const { context, data, resolvedContent, enabledLocales } = options;
  const Component = Object.hasOwn(map, block.type)
    ? map[block.type]
    : undefined;
  const attrs = resolveBlockAttrs(block.id, block.style, block.advanced);
  if (attrs.hidden) return null;
  const content =
    resolvedContent ??
    getBlockContentForLanguage(
      block.content,
      locale,
      defaultLocale,
      enabledLocales?.length ? enabledLocales : undefined,
    );
  return (
    <div
      key={block.id}
      data-block-id={block.id}
      data-block-type={block.type}
      id={attrs.id}
      className={attrs.className}
      style={Component ? attrs.style : { ...attrs.style, display: "none" }}
    >
      {attrs.css ? (
        <style dangerouslySetInnerHTML={{ __html: attrs.css }} />
      ) : null}
      {Component ? (
        createElement(Component, { content, context, data })
      ) : (
        <UnknownBlock type={block.type} />
      )}
    </div>
  );
}
