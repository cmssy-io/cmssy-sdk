import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CMSSY_API_URL,
  resolveApiUrl,
} from "../content/content-client";

describe("resolveApiUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the cmssy cloud endpoint when unset", () => {
    vi.stubEnv("CMSSY_API_URL", "");
    expect(resolveApiUrl(undefined)).toBe(DEFAULT_CMSSY_API_URL);
  });

  it("returns the default for an empty string", () => {
    vi.stubEnv("CMSSY_API_URL", "");
    expect(resolveApiUrl("")).toBe(DEFAULT_CMSSY_API_URL);
  });

  it("keeps an explicit endpoint (self-host / staging override)", () => {
    expect(resolveApiUrl("http://localhost:4000/graphql")).toBe(
      "http://localhost:4000/graphql",
    );
  });

  it("reads CMSSY_API_URL from env when no explicit value", () => {
    vi.stubEnv("CMSSY_API_URL", "http://localhost:4000/graphql");
    expect(resolveApiUrl(undefined)).toBe("http://localhost:4000/graphql");
  });

  it("prefers an explicit value over env", () => {
    vi.stubEnv("CMSSY_API_URL", "http://env:4000/graphql");
    expect(resolveApiUrl("http://explicit:5000/graphql")).toBe(
      "http://explicit:5000/graphql",
    );
  });
});
