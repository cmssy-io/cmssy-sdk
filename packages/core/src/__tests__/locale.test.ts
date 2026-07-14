import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveSiteLocales = vi.hoisted(() => vi.fn());
vi.mock("../data/site-locales", async (importActual) => {
  const actual = await importActual<typeof import("../data/site-locales")>();
  return { ...actual, resolveSiteLocales };
});

import { localeForPath, localeForPathname, splitCmssyLocale } from "../locale";

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

describe("localeForPath", () => {
  it("reads the language off a routed path, in either shape", async () => {
    expect(await localeForPath(CONFIG, ["en", "about"])).toBe("en");
    expect(await localeForPath(CONFIG, "/en/about")).toBe("en");
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
