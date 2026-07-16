import { describe, expect, it } from "vitest";
import { formatEditorLink, formatResult, useColor } from "../format";

describe("formatResult", () => {
  it("renders ok as a plain check line without color", () => {
    expect(
      formatResult(
        { status: "ok", message: "workspace acme/shop is reachable" },
        false,
      ),
    ).toBe("✓ workspace acme/shop is reachable");
  });

  it("renders fail with the fix on its own line", () => {
    expect(
      formatResult(
        {
          status: "fail",
          message: "the draft secret does not match this workspace",
          fix: "copy the secret from Settings → Headless into CMSSY_DRAFT_SECRET",
        },
        false,
      ),
    ).toBe(
      "✗ the draft secret does not match this workspace\n  fix: copy the secret from Settings → Headless into CMSSY_DRAFT_SECRET",
    );
  });

  it("renders unknown as a question mark", () => {
    expect(
      formatResult(
        {
          status: "unknown",
          message:
            "this cmssy platform does not support draft secret verification yet",
        },
        false,
      ),
    ).toBe(
      "? this cmssy platform does not support draft secret verification yet",
    );
  });

  it("wraps the marker in ANSI color when colored", () => {
    const line = formatResult({ status: "ok", message: "done" }, true);
    expect(line).toContain("\u001b[32m✓\u001b[0m");
  });
});

describe("formatEditorLink", () => {
  it("prints the deep link", () => {
    const url =
      "https://www.cmssy.io/dashboard/organizations/acme/workspaces/shop/editor";
    expect(formatEditorLink(url, false)).toContain(url);
  });
});

describe("useColor", () => {
  it("is off without a tty or with NO_COLOR", () => {
    expect(useColor({}, false)).toBe(false);
    expect(useColor({ NO_COLOR: "1" }, true)).toBe(false);
    expect(useColor({}, true)).toBe(true);
  });
});
