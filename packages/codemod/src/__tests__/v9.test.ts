import { describe, it, expect } from "vitest";
import { transform } from "../v9";

describe("codemod v9 - config locale override removal", () => {
  it("strips defaultLocale and enabledLocales from defineCmssyConfig", () => {
    const source = `export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
  defaultLocale: "en",
  enabledLocales: ["en", "pl"],
});
`;
    const { code, changed, notes } = transform(source);
    expect(changed).toBe(true);
    expect(code).toBe(`export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
});
`);
    expect(notes).toHaveLength(2);
    expect(notes?.[0]).toContain('config.defaultLocale ("en")');
  });

  it("strips the keys from a typed CmssyConfig literal", () => {
    const source = `export const cmssy: CmssyConfig = {
  org: "acme",
  workspaceSlug: "ws",
  draftSecret: "x",
  defaultLocale: "pl",
};
`;
    const { code, changed } = transform(source);
    expect(changed).toBe(true);
    expect(code).not.toContain("defaultLocale");
    expect(code).toContain('workspaceSlug: "ws"');
  });

  it("handles a multi-line enabledLocales array", () => {
    const source = `const cmssy = defineCmssyConfig({
  org: "acme",
  enabledLocales: [
    "en",
    "pl",
  ],
  draftSecret: "x",
});
`;
    const { code, changed } = transform(source);
    expect(changed).toBe(true);
    expect(code).not.toContain("enabledLocales");
    expect(code).toContain('draftSecret: "x"');
  });

  it("leaves defaultLocale alone outside a config literal", () => {
    const source = `const siteLocales = { defaultLocale: "en", locales: ["en"] };
<CmssyServerPage defaultLocale={siteLocales.defaultLocale} />;
`;
    const { code, changed, notes } = transform(source);
    expect(changed).toBe(false);
    expect(code).toBe(source);
    expect(notes).toBeUndefined();
  });

  it("does nothing when the config has neither key", () => {
    const source = `export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
});
`;
    const { code, changed, notes } = transform(source);
    expect(changed).toBe(false);
    expect(code).toBe(source);
    expect(notes).toBeUndefined();
  });
});
