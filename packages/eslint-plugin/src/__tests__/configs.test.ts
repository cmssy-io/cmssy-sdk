import { describe, expect, it } from "vitest";

import plugin from "../index";

const RULES = [
  "cmssy/edit-route-provider-parity",
  "cmssy/no-server-config-in-client",
];

function entries(name: string): Record<string, unknown>[] {
  return plugin.configs[name] as Record<string, unknown>[];
}

describe("configs.recommended", () => {
  it("turns both rules on through the cmssy plugin", () => {
    const [entry] = entries("recommended");

    expect(Object.keys(entry?.plugins ?? {})).toEqual(["cmssy"]);
    expect(entry?.rules).toEqual(
      Object.fromEntries(RULES.map((rule) => [rule, "error"])),
    );
  });

  it("claims no files and no parser, so it cannot outrank the app's own", () => {
    for (const entry of entries("recommended")) {
      expect(entry.files).toBeUndefined();
      expect(entry.languageOptions).toBeUndefined();
    }
  });
});

describe("configs.standalone", () => {
  it("carries the parser and the extensions the rules are about", () => {
    const languages = entries("standalone").find((entry) => entry.files);
    const files = languages?.files as string[];

    expect(files.some((pattern) => pattern.includes("tsx"))).toBe(true);
    expect(
      (languages?.languageOptions as { parser?: unknown } | undefined)?.parser,
    ).toBeDefined();
  });

  it("keeps build output out, which eslint does not do by default", () => {
    const ignores = entries("standalone").find(
      (entry) => entry.ignores && !entry.files,
    );

    expect(ignores?.ignores).toContain("**/.next/**");
    expect(ignores?.ignores).toContain("**/dist/**");
  });

  it("is the recommended rules plus that setup", () => {
    for (const entry of entries("recommended")) {
      expect(entries("standalone")).toContainEqual(entry);
    }
  });
});
