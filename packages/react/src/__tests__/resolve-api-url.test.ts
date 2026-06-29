import { describe, expect, it } from "vitest";
import {
  DEFAULT_CMSSY_API_URL,
  resolveApiUrl,
} from "../content/content-client";

describe("resolveApiUrl", () => {
  it("returns the cmssy cloud endpoint when unset", () => {
    expect(resolveApiUrl(undefined)).toBe(DEFAULT_CMSSY_API_URL);
  });

  it("returns the default for an empty string", () => {
    expect(resolveApiUrl("")).toBe(DEFAULT_CMSSY_API_URL);
  });

  it("keeps an explicit endpoint (self-host / staging override)", () => {
    expect(resolveApiUrl("http://localhost:4000/graphql")).toBe(
      "http://localhost:4000/graphql",
    );
  });
});
