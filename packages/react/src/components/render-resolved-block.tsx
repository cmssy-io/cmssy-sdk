import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import type { BlockMap } from "../registry";
import { UnknownBlock } from "./unknown-block";

export function renderResolvedBlock(
  block: RawBlock,
  map: BlockMap,
  locale: string,
  defaultLocale: string,
) {
  const Component = map[block.type];
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
        <Component content={content} />
      ) : (
        <UnknownBlock type={block.type} />
      )}
    </div>
  );
}
