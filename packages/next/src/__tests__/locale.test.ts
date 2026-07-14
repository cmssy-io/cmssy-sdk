import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveSiteLocales = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/core", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/core")>();
  return { ...actual, resolveSiteLocales };
});

let headerStore: Map<string, string>;
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => headerStore.get(key) ?? null,
  })),
}));

import { getCmssyLocale } from "../locale";
import { CMSSY_LOCALE_HEADER } from "@cmssy/core";

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};

beforeEach(() => {
  resolveSiteLocales.mockReset();
  resolveSiteLocales.mockResolvedValue({
    defaultLocale: "pl",
    locales: ["pl", "en"],
  });
  headerStore = new Map();
});

// Resolving a locale from a path is plain string work and lives in @cmssy/core.
// What belongs to Next is the request-bound fallback: the header the middleware
// forwards, and the workspace default when there is none.
describe("getCmssyLocale", () => {
  it("prefers the routed path, which is static-safe", async () => {
    expect(await getCmssyLocale(CONFIG, { path: ["en", "about"] })).toBe("en");
  });

  it("returns the locale from the request header", async () => {
    headerStore.set(CMSSY_LOCALE_HEADER, "en");
    expect(await getCmssyLocale(CONFIG)).toBe("en");
  });

  it("falls back to the workspace default when the header is absent", async () => {
    expect(await getCmssyLocale(CONFIG)).toBe("pl");
  });
});
