import { createElement, type ReactNode } from "react";
import { asBucket, getBlockContentForLanguage } from "@cmssy/core";
import type { RawBlock } from "@cmssy/core";
import type { BlockMap } from "../registry";
import type { CmssyBlockContext } from "@cmssy/core";
import { BlockErrorBoundary } from "@cmssy/react/block-error-boundary";
import { unregisteredBlockError, type CmssyBlockError } from "./block-error";
import { BlockErrorCard } from "./block-error-card";
import { UnknownBlock } from "./unknown-block";

export interface RenderResolvedBlockOptions {
  context?: CmssyBlockContext;
  /** Loader result, passed to the component as the `data` prop. */
  data?: unknown;
  /** Pre-resolved localized content; skips re-resolution when provided. */
  resolvedContent?: Record<string, unknown>;
  enabledLocales?: string[];
  error?: CmssyBlockError;
  editMode?: boolean;
}

export function renderResolvedBlock(
  block: RawBlock,
  map: BlockMap,
  locale: string,
  defaultLocale: string,
  options: RenderResolvedBlockOptions = {},
) {
  const { context, data, resolvedContent, enabledLocales, error, editMode } =
    options;
  const Component = Object.hasOwn(map, block.type)
    ? map[block.type]
    : undefined;

  const wrap = (children: ReactNode, hidden = false) => (
    <div
      key={block.id}
      data-block-id={block.id}
      data-block-type={block.type}
      style={hidden ? { display: "none" } : undefined}
    >
      {children}
    </div>
  );

  if (!Component) {
    return editMode
      ? wrap(
          <BlockErrorCard
            blockType={block.type}
            blockId={block.id}
            error={unregisteredBlockError(block.type)}
          />,
        )
      : wrap(<UnknownBlock type={block.type} />, true);
  }

  if (error) {
    if (!editMode) return null;
    return wrap(
      <BlockErrorCard
        blockType={block.type}
        blockId={block.id}
        error={error}
      />,
    );
  }

  const content =
    resolvedContent ??
    getBlockContentForLanguage(
      block.content,
      locale,
      defaultLocale,
      enabledLocales?.length ? enabledLocales : undefined,
    );
  return wrap(
    <BlockErrorBoundary
      blockType={block.type}
      blockId={block.id}
      editMode={editMode}
    >
      {createElement(Component, {
        content,
        style: asBucket(block.style),
        advanced: asBucket(block.advanced),
        context,
        data,
      })}
    </BlockErrorBoundary>,
  );
}
