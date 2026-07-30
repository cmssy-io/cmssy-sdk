import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as index from "../index";

describe("@cmssy/astro public surface", () => {
  it("exports exactly these names", () => {
    expect(Object.keys(index).sort()).toMatchSnapshot();
  });

  it("publishes exactly these subpaths", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { exports: Record<string, unknown> };

    expect(Object.keys(pkg.exports).sort()).toMatchSnapshot();
  });
});
