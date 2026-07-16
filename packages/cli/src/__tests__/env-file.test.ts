import { describe, expect, it } from "vitest";
import { applyEnv, parseEnvFile } from "../env-file";

describe("parseEnvFile", () => {
  it("parses simple assignments", () => {
    expect(
      parseEnvFile("CMSSY_ORG_SLUG=acme\nCMSSY_WORKSPACE_SLUG=shop"),
    ).toEqual({
      CMSSY_ORG_SLUG: "acme",
      CMSSY_WORKSPACE_SLUG: "shop",
    });
  });

  it("skips comments and blank lines", () => {
    expect(
      parseEnvFile("# comment\n\nKEY=value\n  # indented comment"),
    ).toEqual({ KEY: "value" });
  });

  it("strips surrounding quotes", () => {
    expect(parseEnvFile(`A="quoted value"\nB='single'`)).toEqual({
      A: "quoted value",
      B: "single",
    });
  });

  it("keeps a hash inside a quoted value and strips a trailing comment", () => {
    expect(parseEnvFile(`SECRET="abc#123"\nPORT=3000 # local`)).toEqual({
      SECRET: "abc#123",
      PORT: "3000",
    });
  });

  it("handles export prefixes and equals in values", () => {
    expect(parseEnvFile("export TOKEN=a=b=c")).toEqual({ TOKEN: "a=b=c" });
  });

  it("ignores malformed lines and invalid keys", () => {
    expect(parseEnvFile("=nope\nnot a line\n1BAD=x")).toEqual({});
  });

  it("crlf files parse the same", () => {
    expect(parseEnvFile("A=1\r\nB=2\r\n")).toEqual({ A: "1", B: "2" });
  });
});

describe("applyEnv", () => {
  it("sets missing variables without overwriting existing ones", () => {
    const env: Record<string, string | undefined> = { EXISTING: "keep" };
    const applied = applyEnv({ EXISTING: "clobber", FRESH: "new" }, env);
    expect(env).toEqual({ EXISTING: "keep", FRESH: "new" });
    expect(applied).toEqual(["FRESH"]);
  });

  it("treats an empty string as set", () => {
    const env: Record<string, string | undefined> = { EMPTY: "" };
    applyEnv({ EMPTY: "value" }, env);
    expect(env.EMPTY).toBe("");
  });
});
