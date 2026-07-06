import { describe, it, expect, vi } from "vitest";
import {
  resolveSiteLocales,
  splitLocaleFromPath,
  type CmssySiteLocales,
} from "../data/site-locales";

describe("splitLocaleFromPath", () => {
  const site: CmssySiteLocales = { defaultLocale: "pl", locales: ["pl", "en"] };

  it("strips a non-default locale prefix", () => {
    expect(splitLocaleFromPath(["en", "about"], site)).toEqual({
      locale: "en",
      path: ["about"],
    });
  });

  it("keeps the path for the default locale (no prefix)", () => {
    expect(splitLocaleFromPath(["about"], site)).toEqual({
      locale: "pl",
      path: ["about"],
    });
  });

  it("does not strip a segment equal to the default locale", () => {
    expect(splitLocaleFromPath(["pl", "x"], site)).toEqual({
      locale: "pl",
      path: ["pl", "x"],
    });
  });

  it("ignores unknown locale segments", () => {
    expect(splitLocaleFromPath(["de", "x"], site)).toEqual({
      locale: "pl",
      path: ["de", "x"],
    });
  });

  it("handles an empty path", () => {
    expect(splitLocaleFromPath(undefined, site)).toEqual({
      locale: "pl",
      path: undefined,
    });
  });
});

describe("resolveSiteLocales", () => {
  it("reads defaultLanguage + enabledLanguages from public.siteConfig", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          public: {
            siteConfig: {
              defaultLanguage: "pl",
              enabledLanguages: ["pl", "en"],
            },
          },
        },
      }),
    }));
    const res = await resolveSiteLocales(
      { apiUrl: "https://api.test/graphql", org: "acme", workspaceSlug: "ws-a" },
      { fetch: fetchMock as never },
    );
    expect(res).toEqual({ defaultLocale: "pl", locales: ["pl", "en"] });
  });

  it("falls back to en on error", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("boom");
    });
    const res = await resolveSiteLocales(
      { apiUrl: "https://api.test/graphql", org: "acme", workspaceSlug: "ws-b" },
      { fetch: fetchMock as never },
    );
    expect(res).toEqual({ defaultLocale: "en", locales: ["en"] });
  });
});
