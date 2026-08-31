import { describe, expect, it } from "vitest";

import { transform } from "../v15";

describe("v15 codemod", () => {
  it("renames layoutPositions to layoutRegions in defineBlock", () => {
    const { code, changed } = transform(
      'export default defineBlock({\n  type: "site-header",\n  layoutPositions: ["header"],\n});',
    );
    expect(changed).toBe(true);
    expect(code).toContain('layoutRegions: ["header"]');
    expect(code).not.toContain("layoutPositions");
  });

  it("renames position= on CmssyLayoutSlot", () => {
    const { code, changed } = transform(
      '<CmssyLayoutSlot position="header" editMode={editMode} />',
    );
    expect(changed).toBe(true);
    expect(code).toBe(
      '<CmssyLayoutSlot region="header" editMode={editMode} />',
    );
  });

  it("renames position= on CmssyServerLayout, CmssyEditableLayout and CmssyLazyLayout", () => {
    const { code } = transform(
      [
        '<CmssyServerLayout position="footer" />',
        "<CmssyEditableLayout position={slot} />",
        '<CmssyLazyLayout position="sidebar_left" />',
      ].join("\n"),
    );
    expect(code).toBe(
      [
        '<CmssyServerLayout region="footer" />',
        "<CmssyEditableLayout region={slot} />",
        '<CmssyLazyLayout region="sidebar_left" />',
      ].join("\n"),
    );
  });

  it("renames position= across a multiline tag", () => {
    const { code } = transform(
      '<CmssyLayoutSlot\n  cmssy={cmssy}\n  position="header"\n  locale={locale}\n/>',
    );
    expect(code).toBe(
      '<CmssyLayoutSlot\n  cmssy={cmssy}\n  region="header"\n  locale={locale}\n/>',
    );
  });

  it("leaves position= on other components alone", () => {
    const source =
      '<Tooltip position="top" /><CmssyLayoutSlot region="header" />';
    const { code, changed } = transform(source);
    expect(code).toBe(source);
    expect(changed).toBe(false);
  });

  it("leaves CSS position and shorthand object keys alone", () => {
    const source =
      'const style = { position: "fixed" };\nresolveCmssyLayout(cmssy, { region });';
    const { code, changed } = transform(source);
    expect(code).toBe(source);
    expect(changed).toBe(false);
  });

  it("renames position= even after an arrow-function prop", () => {
    const { code } = transform(
      '<CmssyLayoutSlot onSelect={() => pick()} position="header" />',
    );
    expect(code).toBe(
      '<CmssyLayoutSlot onSelect={() => pick()} region="header" />',
    );
  });

  it("leaves position= on a nested foreign component inside a prop alone", () => {
    const { code } = transform(
      '<CmssyLayoutSlot fallback={<Tooltip position="top" />} position="header" />',
    );
    expect(code).toBe(
      '<CmssyLayoutSlot fallback={<Tooltip position="top" />} region="header" />',
    );
  });
});
