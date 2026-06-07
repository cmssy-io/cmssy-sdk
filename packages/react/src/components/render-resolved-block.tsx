import { createElement } from "react";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import type { BlockMap } from "../registry";
import type { CmssyBlockContext } from "./block-context";
import { UnknownBlock } from "./unknown-block";

export function renderResolvedBlock(
  block: RawBlock,
  map: BlockMap,
  locale: string,
  defaultLocale: string,
  context?: CmssyBlockContext,
) {
  const Component = Object.hasOwn(map, block.type)
    ? map[block.type]
    : undefined;
  const content = getBlockContentForLanguage(
    block.content,
    locale,
    defaultLocale,
  );
  return (
    <div
      key={block.id}
      data-block-id={block.id}
      data-block-type={block.type}
      style={Component ? undefined : { display: "none" }}
    >
      {Component ? (
        createElement(Component, { content, context })
      ) : (
        <UnknownBlock type={block.type} />
      )}
    </div>
  );
}
