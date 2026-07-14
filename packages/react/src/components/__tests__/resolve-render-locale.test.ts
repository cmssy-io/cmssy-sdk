import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRenderLocale } from "../resolve-render-locale";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: `ws-${Math.random()}`,
};

/** resolveSiteLocales caches per workspace, so each test needs its own slug. */
function config() {
  return { ...CONFIG, workspaceSlug: `ws-${Date.now()}-${Math.random()}` };
}

function stubSiteConfig(
  siteConfig: { defaultLanguage?: string; enabledLanguages?: string[] } | null,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { public: { siteConfig } } }),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveRenderLocale", () => {
  it("asks the workspace for its default language instead of assuming English", async () => {
    // A Norwegian-first workspace used to get an English header under a
    // Norwegian page, with no error to show for it - the SDK guessed.
    stubSiteConfig({ defaultLanguage: "no", enabledLanguages: ["no", "en"] });

    const resolved = await resolveRenderLocale({ config: config() });

    expect(resolved.defaultLocale).toBe("no");
    expect(resolved.locale).toBe("no");
    expect(resolved.enabledLocales).toEqual(["no", "en"]);
  });

  it("keeps the locale the caller read off the URL", async () => {
    stubSiteConfig({ defaultLanguage: "no", enabledLanguages: ["no", "en"] });

    const resolved = await resolveRenderLocale({
      locale: "en",
      config: config(),
    });

    expect(resolved.locale).toBe("en");
    expect(resolved.defaultLocale).toBe("no");
  });

  it("does not fetch when the caller passed both languages", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);

    const resolved = await resolveRenderLocale({
      locale: "pl",
      defaultLocale: "pl",
      config: config(),
    });

    expect(fetchStub).not.toHaveBeenCalled();
    expect(resolved.locale).toBe("pl");
  });

  it("falls back to English only when it has nothing to ask, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = await resolveRenderLocale({});

    expect(resolved.locale).toBe("en");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[cmssy]"));
    warn.mockRestore();
  });
});
