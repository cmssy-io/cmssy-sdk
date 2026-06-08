import { createElement } from "react";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import type { BlockMap } from "../registry";
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
  const content =
    resolvedContent ??
    getBlockContentForLanguage(
      block.content,
      locale,
      defaultLocale,
      enabledLocales,
    );
  return (
    <div
      key={block.id}
      data-block-id={block.id}
      data-block-type={block.type}
      style={Component ? undefined : { display: "none" }}
    >
      {Component ? (
        createElement(Component, { content, context, data })
      ) : (
        <UnknownBlock type={block.type} />
      )}
    </div>
  );
}
