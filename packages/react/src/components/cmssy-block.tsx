import { createElement } from "react";
import { getRegisteredComponent } from "../registry";
import { getBlockContentForLanguage } from "../content/get-block-content";
import type { RawBlock } from "../content/content-client";
import { UnknownBlock } from "./unknown-block";

export interface CmssyBlockProps {
  block: RawBlock;
  locale: string;
  defaultLocale: string;
}

export function CmssyBlock({ block, locale, defaultLocale }: CmssyBlockProps) {
  const registration = getRegisteredComponent(block.type);
  const content = getBlockContentForLanguage(block.content, locale, defaultLocale);
  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      style={registration ? undefined : { display: "none" }}
    >
      {registration ? (
        createElement(registration.component, { content })
      ) : (
        <UnknownBlock type={block.type} />
      )}
    </div>
  );
}
