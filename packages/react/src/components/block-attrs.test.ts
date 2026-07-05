import { describe, expect, it } from "vitest";
import { resolveBlockAttrs } from "./block-attrs";

describe("resolveBlockAttrs", () => {
  it("maps the Style bucket to inline styles", () => {
    const attrs = resolveBlockAttrs(
      "b1",
      { background: "#fff", padding: "md", align: "center", maxWidth: "lg" },
      {},
    );

    expect(attrs.style).toEqual({
      background: "#fff",
      paddingTop: "1rem",
      paddingBottom: "1rem",
      textAlign: "center",
      maxWidth: "1024px",
      marginLeft: "auto",
      marginRight: "auto",
    });
  });

  it("ignores unknown/empty tokens", () => {
    const attrs = resolveBlockAttrs(
      "b1",
      { padding: "none", align: "justify", maxWidth: "" },
      {},
    );
    expect(attrs.style).toBeUndefined();
  });

  it("maps the Advanced bucket to id and className", () => {
    const attrs = resolveBlockAttrs(
      "b1",
      {},
      { anchorId: "hero", className: "featured" },
    );
    expect(attrs.id).toBe("hero");
    expect(attrs.className).toBe("featured");
  });

  it("marks hidden only when visible is explicitly false", () => {
    expect(resolveBlockAttrs("b1", {}, { visible: false }).hidden).toBe(true);
    expect(resolveBlockAttrs("b1", {}, {}).hidden).toBe(false);
    expect(resolveBlockAttrs("b1", {}, { visible: true }).hidden).toBe(false);
  });

  it("emits scoped CSS for customCss and hideOnMobile keyed to the block id", () => {
    const attrs = resolveBlockAttrs(
      "abc",
      {},
      { customCss: "border: 1px solid red;", hideOnMobile: true },
    );
    expect(attrs.css).toBe(
      '[data-block-id="abc"]{border: 1px solid red;}' +
        '@media (max-width:767px){[data-block-id="abc"]{display:none !important}}',
    );
  });

  it("strips a </style> breakout from customCss", () => {
    const attrs = resolveBlockAttrs(
      "abc",
      {},
      { customCss: "color: red;</style><script>x" },
    );
    expect(attrs.css).not.toContain("</style");
  });

  it("returns bare defaults for empty buckets", () => {
    const attrs = resolveBlockAttrs("b1", null, undefined);
    expect(attrs).toEqual({
      style: undefined,
      className: undefined,
      id: undefined,
      hidden: false,
      css: undefined,
    });
  });
});
