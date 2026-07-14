import { describe, expect, it } from "vitest";

import { transform } from "../v7";

describe("v7 codemod", () => {
  it("renames CmssyChrome, which named a browser rather than a layout slot", () => {
    const { code, changed } = transform(
      'import { CmssyChrome } from "@cmssy/next/server";\n<CmssyChrome position="header" />',
    );

    expect(changed).toBe(true);
    expect(code).toContain('import { CmssyLayoutSlot } from "@cmssy/next/server";');
    expect(code).toContain('<CmssyLayoutSlot position="header" />');
  });

  it("renames the props type too", () => {
    const { code } = transform('import type { CmssyChromeProps } from "@cmssy/next/server";');
    expect(code).toContain("CmssyLayoutSlotProps");
  });

  it("leaves an app that never used it alone", () => {
    const source = 'import { createCmssyPage } from "@cmssy/next/server";';
    expect(transform(source)).toEqual({ code: source, changed: false });
  });
});
