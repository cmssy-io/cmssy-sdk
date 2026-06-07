import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveSiteLocales = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/react")>();
  return { ...actual, resolveSiteLocales };
});

let headerStore: Map<string, string>;
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => headerStore.get(key) ?? null,
  })),
}));

import {
  localeForPathname,
  splitCmssyLocale,
  getCmssyLocale,
  CMSSY_LOCALE_HEADER,
} from "../locale";

const CONFIG = { apiUrl: "https://api.test/graphql", workspaceSlug: "ws" };

beforeEach(() => {
  resolveSiteLocales.mockReset();
  resolveSiteLocales.mockResolvedValue({
    defaultLocale: "pl",
    locales: ["pl", "en"],
  });
  headerStore = new Map();
});

describe("localeForPathname", () => {
  it("returns the non-default locale from the path prefix", async () => {
    expect(await localeForPathname(CONFIG, "/en/about")).toBe("en");
  });

  it("returns the default locale for an unprefixed path", async () => {
    expect(await localeForPathname(CONFIG, "/about")).toBe("pl");
  });

  it("returns the default locale for the root path", async () => {
    expect(await localeForPathname(CONFIG, "/")).toBe("pl");
  });
});

describe("splitCmssyLocale", () => {
  it("splits the locale prefix off the path", async () => {
    expect(await splitCmssyLocale(CONFIG, ["en", "about"])).toEqual({
      locale: "en",
      path: ["about"],
    });
  });

  it("keeps the default-locale path intact", async () => {
    expect(await splitCmssyLocale(CONFIG, ["about"])).toEqual({
      locale: "pl",
      path: ["about"],
    });
  });
});

describe("getCmssyLocale", () => {
  it("returns the locale from the request header", async () => {
    headerStore.set(CMSSY_LOCALE_HEADER, "en");
    expect(await getCmssyLocale(CONFIG)).toBe("en");
  });

  it("falls back to the workspace default when the header is absent", async () => {
    expect(await getCmssyLocale(CONFIG)).toBe("pl");
  });
});
