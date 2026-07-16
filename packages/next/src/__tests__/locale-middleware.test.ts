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
import { CMSSY_LOCALE_HEADER } from "@cmssy/core";

const CONFIG = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
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
  it("reads the locale from the path prefix against the workspace locales", async () => {
    expect(await resolveLocaleFromPathname(CONFIG, "/en/about")).toBe("en");
    expect(resolveSiteLocales).toHaveBeenCalledOnce();
  });

  it("returns the workspace default for an unprefixed path", async () => {
    expect(await resolveLocaleFromPathname(CONFIG, "/about")).toBe("pl");
  });

  it("treats a prefix outside the workspace locales as content, not language", async () => {
    expect(await resolveLocaleFromPathname(CONFIG, "/de/about")).toBe("pl");
  });
});

describe("createCmssyLocaleMiddleware", () => {
  it("forwards the resolved locale as the x-cmssy-locale request header", async () => {
    const middleware = createCmssyLocaleMiddleware(CONFIG);
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
