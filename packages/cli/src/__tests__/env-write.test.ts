import { describe, expect, it } from "vitest";
import { mergeEnvContent } from "../env-write";

describe("mergeEnvContent", () => {
  it("creates content from nothing", () => {
    expect(mergeEnvContent(null, { CMSSY_ORG_SLUG: "acme" })).toBe(
      "CMSSY_ORG_SLUG=acme\n",
    );
  });

  it("replaces an existing key in place and keeps everything else", () => {
    const existing = [
      "# my app",
      "DATABASE_URL=postgres://localhost/db",
      "CMSSY_ORG_SLUG=old",
      "",
      "OTHER=1",
    ].join("\n");
    const merged = mergeEnvContent(existing, {
      CMSSY_ORG_SLUG: "acme",
      CMSSY_DRAFT_SECRET: "s3cret",
    });
    expect(merged).toBe(
      [
        "# my app",
        "DATABASE_URL=postgres://localhost/db",
        "CMSSY_ORG_SLUG=acme",
        "",
        "OTHER=1",
        "CMSSY_DRAFT_SECRET=s3cret",
        "",
      ].join("\n"),
    );
  });

  it("replaces an exported assignment without duplicating it", () => {
    const merged = mergeEnvContent("export CMSSY_ORG_SLUG=old\n", {
      CMSSY_ORG_SLUG: "acme",
    });
    expect(merged).toBe("CMSSY_ORG_SLUG=acme\n");
  });

  it("quotes values containing spaces or hashes", () => {
    expect(mergeEnvContent(null, { SECRET: "a b#c" })).toBe('SECRET="a b#c"\n');
  });

  it("escapes quotes and backslashes inside quoted values", () => {
    expect(mergeEnvContent(null, { SECRET: 'a"b\\c ' })).toBe(
      'SECRET="a\\"b\\\\c "\n',
    );
  });

  it("does not touch a commented-out assignment", () => {
    const merged = mergeEnvContent("# CMSSY_ORG_SLUG=old\n", {
      CMSSY_ORG_SLUG: "acme",
    });
    expect(merged).toBe("# CMSSY_ORG_SLUG=old\nCMSSY_ORG_SLUG=acme\n");
  });

  it("ends with exactly one trailing newline", () => {
    expect(mergeEnvContent("A=1\n\n\n", { B: "2" })).toBe("A=1\nB=2\n");
  });
});
