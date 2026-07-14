import { describe, expect, it } from "vitest";

import { transform } from "../v8";

describe("v8", () => {
  it("drops the type arguments defineBlock no longer needs", () => {
    const { code, changed } = transform(
      `const b = defineBlock<HeroContent, { posts: Post[] }>({ type: "hero" });`,
    );

    expect(changed).toBe(true);
    expect(code).toBe(`const b = defineBlock({ type: "hero" });`);
  });

  it("handles nested type arguments", () => {
    const { code } = transform(
      `defineBlock<Record<string, unknown>, Array<Post>>({})`,
    );

    expect(code).toBe(`defineBlock({})`);
  });

  it("leaves a less-than comparison alone", () => {
    const source = `if (defineBlock < 3) doThing();`;

    expect(transform(source).code).toBe(source);
  });

  /**
   * The point of the version. Rewriting a hand-written content type would copy
   * the drift forward - the drift IS the bug. Name the file and stop.
   */
  it("does NOT rewrite a hand-typed component, it reports it", () => {
    const source = [
      `import { defineBlock, fields } from "@cmssy/react";`,
      `interface HeroContent { heading?: string }`,
      `function Hero({ content }: { content: HeroContent }) { return content.heading; }`,
      `export const heroBlock = defineBlock({ type: "hero", component: Hero, props: { headline: fields.text() } });`,
    ].join("\n");

    const result = transform(source);

    expect(result.code).toBe(source);
    expect(result.notes?.[0]).toContain("BlockProps");
  });

  it("says nothing about a block already typed from its schema", () => {
    const source = [
      `import { defineBlock, fields, type BlockProps } from "@cmssy/react";`,
      `const heroProps = { heading: fields.text({ required: true }) };`,
      `function Hero({ content }: BlockProps<typeof heroProps>) { return content.heading; }`,
      `export const heroBlock = defineBlock({ type: "hero", component: Hero, props: heroProps });`,
    ].join("\n");

    const result = transform(source);

    expect(result.changed).toBe(false);
    expect(result.notes).toBeUndefined();
  });

  it("ignores a file that has nothing to do with blocks", () => {
    const result = transform(`export const sum = (a: number) => a + 1;`);

    expect(result.changed).toBe(false);
    expect(result.notes).toBeUndefined();
  });
});
