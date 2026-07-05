import type { CSSProperties } from "react";

const PADDING_SCALE: Record<string, string> = {
  none: "0",
  sm: "0.5rem",
  md: "1rem",
  lg: "2rem",
  xl: "4rem",
};

const MAX_WIDTH_SCALE: Record<string, string> = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  full: "100%",
};

const TEXT_ALIGN = new Set(["left", "center", "right"]);

export interface BlockWrapperAttrs {
  style?: CSSProperties;
  className?: string;
  id?: string;
  hidden: boolean;
  css?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function resolveBlockAttrs(
  blockId: string,
  styleBucket: unknown,
  advancedBucket: unknown,
): BlockWrapperAttrs {
  const s = asRecord(styleBucket);
  const a = asRecord(advancedBucket);

  const style: CSSProperties = {};

  const background = text(s.background);
  if (background) style.background = background;

  const padding = text(s.padding);
  if (padding && PADDING_SCALE[padding]) {
    style.paddingTop = PADDING_SCALE[padding];
    style.paddingBottom = PADDING_SCALE[padding];
  }

  const align = text(s.align);
  if (align && TEXT_ALIGN.has(align)) {
    style.textAlign = align as CSSProperties["textAlign"];
  }

  const maxWidth = text(s.maxWidth);
  if (maxWidth && MAX_WIDTH_SCALE[maxWidth]) {
    style.maxWidth = MAX_WIDTH_SCALE[maxWidth];
    style.marginLeft = "auto";
    style.marginRight = "auto";
  }

  const selector = `[data-block-id="${blockId.replace(/["\\]/g, "\\$&")}"]`;
  const rules: string[] = [];

  const customCss = text(a.customCss);
  if (customCss) {
    const safe = customCss.replace(/[{}]/g, "").replace(/<\/style/gi, "");
    rules.push(`${selector}{${safe}}`);
  }
  if (a.hideOnMobile === true) {
    rules.push(
      `@media (max-width:767px){${selector}{display:none !important}}`,
    );
  }

  return {
    style: Object.keys(style).length > 0 ? style : undefined,
    className: text(a.className),
    id: text(a.anchorId),
    hidden: a.visible === false,
    css: rules.length > 0 ? rules.join("") : undefined,
  };
}
