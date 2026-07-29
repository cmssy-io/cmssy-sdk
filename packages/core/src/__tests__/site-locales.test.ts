import { describe, it, expect, vi } from "vitest";
import {
  localesFromSiteConfig,
  resolveSiteLocales,
  resolveCmssyLocale,
  splitLocaleFromPath,
  type CmssySiteLocales,
} from "../data/site-locales";

describe("localesFromSiteConfig", () => {
  it("maps the workspace languages", () => {
    expect(
      localesFromSiteConfig({
        defaultLanguage: "pl",
        enabledLanguages: ["pl", "en"],
      }),
    ).toEqual({ defaultLocale: "pl", locales: ["pl", "en"] });
  });

  it("falls back to [default] when no languages are enabled", () => {
    expect(localesFromSiteConfig({ defaultLanguage: "no" })).toEqual({
      defaultLocale: "no",
      locales: ["no"],
    });
  });

  it("degrades to en for a missing site config", () => {
    expect(localesFromSiteConfig(null)).toEqual({
      defaultLocale: "en",
      locales: ["en"],
    });
  });
});

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

describe("resolveCmssyLocale", () => {
  const serving = (defaultLanguage: string, enabledLanguages: string[]) =>
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { public: { siteConfig: { defaultLanguage, enabledLanguages } } },
      }),
    }));

  const config = (workspaceSlug: string) => ({
    apiUrl: "https://api.test/graphql",
    org: "acme",
    workspaceSlug,
  });

  it("reads the language off the first path segment", async () => {
    const locale = await resolveCmssyLocale(
      config("ws-c"),
      ["no", "blog"],
      { fetch: serving("en", ["en", "no"]) as never },
    );

    expect(locale).toBe("no");
  });

  it("answers the default for an unprefixed path", async () => {
    const locale = await resolveCmssyLocale(
      config("ws-d"),
      ["about"],
      { fetch: serving("en", ["en", "no"]) as never },
    );

    expect(locale).toBe("en");
  });

  it("answers the default for the home page, which has no segments at all", async () => {
    const locale = await resolveCmssyLocale(config("ws-e"), undefined, {
      fetch: serving("pl", ["pl", "en"]) as never,
    });

    expect(locale).toBe("pl");
  });

  it("names no language when the workspace's languages cannot be read", async () => {
    const locale = await resolveCmssyLocale(config("ws-g"), ["no", "blog"], {
      fetch: vi.fn(async () => {
        throw new Error("upstream is down");
      }) as never,
    });

    expect(locale).toBeUndefined();
  });

  it("asks once while the API is failing, not once per caller", async () => {
    const down = vi.fn(async () => {
      throw new Error("upstream is down");
    });

    await resolveCmssyLocale(config("ws-h"), undefined, {
      fetch: down as never,
    });
    const second = await resolveCmssyLocale(config("ws-h"), ["no"], {
      fetch: down as never,
    });

    expect(second).toBeUndefined();
    expect(down).toHaveBeenCalledTimes(1);
  });

  it("does not treat the default language's own prefix as a language", async () => {
    const locale = await resolveCmssyLocale(
      config("ws-f"),
      ["en", "about"],
      { fetch: serving("en", ["en", "no"]) as never },
    );

    expect(locale).toBe("en");
  });
});
