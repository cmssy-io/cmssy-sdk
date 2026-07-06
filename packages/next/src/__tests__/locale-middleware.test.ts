import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveSiteLocales = vi.hoisted(() => vi.fn());
vi.mock("@cmssy/react", async (importActual) => {
  const actual = await importActual<typeof import("@cmssy/react")>();
  return { ...actual, resolveSiteLocales };
});

const nextSpy = vi.hoisted(() => vi.fn((init?: unknown) => ({ init })));
vi.mock("next/server", () => ({
  NextResponse: { next: nextSpy },
}));

import {
  resolveLocaleFromPathname,
  createCmssyLocaleMiddleware,
} from "../locale-middleware";
import { CMSSY_LOCALE_HEADER } from "../locale";

const STATIC = {
  apiUrl: "https://api.test/graphql",
  org: "acme", workspaceSlug: "ws",
  draftSecret: "x",
  editorOrigin: "https://cmssy.io",
  defaultLocale: "pl",
  enabledLocales: ["pl", "en"],
};

const DYNAMIC = {
  apiUrl: "https://api.test/graphql",
  org: "acme", workspaceSlug: "ws",
  draftSecret: "x",
  editorOrigin: "https://cmssy.io",
};

beforeEach(() => {
  resolveSiteLocales.mockReset();
  resolveSiteLocales.mockResolvedValue({
    defaultLocale: "pl",
    locales: ["pl", "en"],
  });
  nextSpy.mockClear();
});

describe("resolveLocaleFromPathname", () => {
  it("uses static config without a network fetch", async () => {
    expect(await resolveLocaleFromPathname(STATIC, "/en/about")).toBe("en");
    expect(resolveSiteLocales).not.toHaveBeenCalled();
  });

  it("returns default for an unprefixed path", async () => {
    expect(await resolveLocaleFromPathname(STATIC, "/about")).toBe("pl");
  });

  it("fetches workspace locales when config is not static", async () => {
    expect(await resolveLocaleFromPathname(DYNAMIC, "/en/x")).toBe("en");
    expect(resolveSiteLocales).toHaveBeenCalledOnce();
  });

  it("applies config.defaultLocale over the fetched default when enabledLocales is absent", async () => {
    // fetched default is "pl"; config overrides it to "en"
    const config = { ...DYNAMIC, defaultLocale: "en" };
    expect(await resolveLocaleFromPathname(config, "/")).toBe("en");
    expect(resolveSiteLocales).toHaveBeenCalledOnce();
  });
});

describe("createCmssyLocaleMiddleware", () => {
  it("forwards the resolved locale as the x-cmssy-locale request header", async () => {
    const middleware = createCmssyLocaleMiddleware(STATIC);
    await middleware({
      nextUrl: { pathname: "/en/about" },
      headers: new Headers(),
    } as never);
    const init = nextSpy.mock.calls[0]?.[0] as {
      request: { headers: Headers };
    };
    expect(init.request.headers.get(CMSSY_LOCALE_HEADER)).toBe("en");
  });
});
