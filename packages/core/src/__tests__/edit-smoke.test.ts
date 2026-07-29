import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCmssyEditMode } from "../testing/edit-smoke";

const BASE = "http://localhost:3000";
const SECRET = "draft-secret-1234";

const PUBLIC_HTML = "<html><header>MACHTEC</header><main>hi</main></html>";
const EDITOR = '<div data-cmssy-editor="1" hidden></div>';
const EDIT_HTML = '<html><div data-cmssy-editor="1" hidden></div><main>hi</main></html>';
/** What an edit route with a mounted layout slot serves (see CmssyLazyLayout). */
const EDIT_HTML_WITH_SLOT =
  '<html><div data-cmssy-editor="1" hidden></div><div data-cmssy-layout-slot="header" data-cmssy-editor-content="2" hidden></div><main>hi</main></html>';

/** A slot that is mounted and resolved nothing: rendered outside edit mode. */
const EDIT_HTML_SLOT_EMPTY =
  '<html><div data-cmssy-editor="1" hidden></div><div data-cmssy-layout-slot="header" data-cmssy-editor-content="0" hidden></div><main>hi</main></html>';

/** A slot from a consumer still on an older @cmssy/react: no count at all. */
const EDIT_HTML_SLOT_NO_COUNT =
  '<html><div data-cmssy-editor="1" hidden></div><div data-cmssy-layout-slot="header" hidden></div><main>hi</main></html>';

/**
 * Serves a body per URL; anything unrouted 404s, which the check reports.
 *
 * Routes answer with a framing CSP that admits the editor, unless `blocked`
 * names them - those get the `frame-ancestors 'none'` that 11.4.1 shipped from
 * a malformed editorOrigin, which is what actually locks the admin out. An
 * absent CSP is not that: it restricts nothing.
 */
function serve(routes: Record<string, string>, blocked: string[] = []) {
  const fetchStub = vi.fn(async (url: string) => {
    const body = routes[url];
    return {
      status: body === undefined ? 404 : 200,
      text: async (): Promise<string> => body ?? "",
      headers: new Headers({
        "content-security-policy": blocked.includes(url)
          ? "frame-ancestors 'none'"
          : "frame-ancestors https://cmssy.io",
      }),
    };
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

const verifiedUrl = (path = "/") =>
  `${BASE}${path}?cmssyEdit=1&cmssySecret=${SECRET}`;

afterEach(() => vi.unstubAllGlobals());

describe("checkCmssyEditMode", () => {
  it("passes a site whose public page, unverified request and editor all behave", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("does not require layout blocks: a site with no header or footer is valid", async () => {
    const bare = "<html><main>hi</main></html>";
    serve({
      [`${BASE}/`]: bare,
      [`${BASE}/?cmssyEdit=1`]: bare,
      [verifiedUrl()]: '<html><div data-cmssy-editor="1" hidden></div><main>hi</main></html>',
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.failures).toEqual([]);
  });

  it("fails when the verified request renders no editor - the /cmssy-edit route is missing (CMS-969)", async () => {
    // Exactly what a consumer looks like after an SDK 4 bump without the route:
    // the site serves fine, and the editor iframe gets a page it cannot edit.
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: PUBLIC_HTML,
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("no editor in the response");
  });

  it("fails when the header is still server-rendered in edit mode (CMS-970)", async () => {
    // The editor selects the header and has no fields for it: the blocks never
    // reached the edit bridge.
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: `<html><div data-cmssy-editor="1" hidden></div><header>MACHTEC</header></html>`,
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("still server-rendered");
  });

  it("fails when a bare cmssyEdit=1 opens the editor (CMS-948)", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: EDIT_HTML,
      [verifiedUrl()]: EDIT_HTML,
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("without a secret");
  });

  it("fails when the localized preview renders in the default language", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      // The editor is mounted, but the page still says it is English.
      [verifiedUrl("/no")]: `<html lang="en">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl()]: EDIT_HTML,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("wrong language");
  });

  // <html lang> is a contract. A word from the page's copy is content - an editor
  // can rewrite it at any time, and then the test lies about what it proved.
  it("passes when the localized preview declares the language its URL asks for", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.failures).toEqual([]);
  });

  it("fails when the edit route answers differently reached directly", async () => {
    // Both URLs render the same page for the same editor. Until 11.4.2 the
    // direct one resolved its language from the whole path, `cmssy-edit`
    // included, and served the default. Nothing saw it: this check only ever
    // went through the rewrite.
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl("/cmssy-edit/no")]: `<html lang="en">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("two languages");
  });

  it("fails when the edit route cannot be framed", async () => {
    serve(
      {
        [`${BASE}/`]: PUBLIC_HTML,
        [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
        [verifiedUrl()]: EDIT_HTML,
        [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
        [verifiedUrl("/cmssy-edit/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      },
      [verifiedUrl("/cmssy-edit/no")],
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("blocks the cmssy editor");
  });

  it("does not call a route unframeable for carrying no CSP at all", async () => {
    // An absent Content-Security-Policy restricts nothing - the admin frames
    // such a route fine. Reading its absence as "cannot be framed" got this
    // exactly backwards, and would have failed every correct Remix consumer.
    const noHeaders = vi.fn(async (url: string) => {
      const routes: Record<string, string> = {
        [`${BASE}/`]: PUBLIC_HTML,
        [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
        [verifiedUrl()]: EDIT_HTML,
        [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
        [verifiedUrl("/cmssy-edit/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      };
      const body = routes[url];
      return {
        status: body === undefined ? 404 : 200,
        text: async (): Promise<string> => body ?? "",
        headers: new Headers(),
      };
    });
    vi.stubGlobal("fetch", noHeaders);

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.failures).toEqual([]);
  });

  it("probes the edit route on a site with no localized path at all", async () => {
    // Most consumers have one language and never pass localizedPath. The two
    // ways into the edit route disagreed about framing regardless of language,
    // so this must not be reachable only through the localized branch.
    serve(
      {
        [`${BASE}/`]: PUBLIC_HTML,
        [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
        [verifiedUrl()]: EDIT_HTML,
        [verifiedUrl("/cmssy-edit")]: EDIT_HTML,
      },
      [verifiedUrl("/cmssy-edit")],
    );

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("blocks the cmssy editor");
  });

  it("does not double the prefix when the caller passes the edit route itself", async () => {
    const fetchStub = serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/cmssy-edit")]: EDIT_HTML,
      [verifiedUrl("/cmssy-edit/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/cmssy-edit/no",
    });

    expect(result.failures).toEqual([]);
    const asked = fetchStub.mock.calls.map(([url]) => String(url));
    expect(asked.some((url) => url.includes("/cmssy-edit/cmssy-edit"))).toBe(
      false,
    );
  });

  it("passes when both ways into the edit route agree", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl("/cmssy-edit/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.failures).toEqual([]);
  });

  it("reads the language of an edit-route path off the segment after the prefix", async () => {
    // A caller who passes the edit route as `localizedPath` was told its
    // language is `cmssy-edit`, by the check meant to catch that confusion.
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/cmssy-edit/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/cmssy-edit/no",
    });

    expect(result.failures).toEqual([]);
  });
});

describe("checkCmssyEditMode with a workspace", () => {
  const WORKSPACE = { org: "acme", workspaceSlug: "shop" };
  const DELIVERY = "https://api.cmssy.io/public/acme/shop/graphql";
  const NO_LAYOUT_HTML = "<html><main>hi</main></html>";

  /**
   * Serves pages by URL and answers both workspace probes: the layout groups,
   * and the site config the second language is read off.
   */
  function serveWithWorkspace(
    routes: Record<string, string>,
    layouts: unknown,
    siteConfig: unknown = null,
  ) {
    const fetchStub = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url === DELIVERY) {
        const asksForSiteConfig = String(init?.body ?? "").includes(
          "PublicSiteConfig",
        );
        return {
          ok: true,
          status: 200,
          json: async () =>
            layouts instanceof Error
              ? { errors: [{ message: String(layouts.message) }] }
              : {
                  data: asksForSiteConfig
                    ? { public: { siteConfig } }
                    : { public: { page: { layouts } } },
                },
          text: async (): Promise<string> => "",
        };
      }
      const body = routes[url];
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        text: async (): Promise<string> => body ?? "",
        json: async () => ({}),
        headers: new Headers({
          "content-security-policy": "frame-ancestors https://cmssy.io",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  it("fails an app that mounts no editable layout slot when the workspace has blocks", async () => {
    serveWithWorkspace(
      {
        [`${BASE}/`]: NO_LAYOUT_HTML,
        [`${BASE}/?cmssyEdit=1`]: NO_LAYOUT_HTML,
        [verifiedUrl()]: EDIT_HTML,
      },
      [{ position: "header", blocks: [{ id: "b1", isActive: true }] }],
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/no editable layout slot/);
  });

  it("passes the same app once it mounts the layout slot", async () => {
    serveWithWorkspace(
      {
        [`${BASE}/`]: PUBLIC_HTML,
        [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
        [verifiedUrl()]: EDIT_HTML_WITH_SLOT,
      },
      [{ position: "header", blocks: [{ id: "b1", isActive: true }] }],
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.failures).toEqual([]);
  });

  it("fails a slot that is mounted but resolved nothing - it is not in edit mode", async () => {
    serveWithWorkspace(
      {
        [`${BASE}/`]: PUBLIC_HTML,
        [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
        [verifiedUrl()]: EDIT_HTML_SLOT_EMPTY,
      },
      [{ position: "header", blocks: [{ id: "b1", isActive: true }] }],
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    // This is the state the Astro adapter shipped in: the slot renders, the
    // marker is there, and the editor is looking at the published page. The
    // old check passed it.
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/resolved 0 blocks/);
  });

  it("fails a consumer whose slot emits no count at all", async () => {
    serveWithWorkspace(
      {
        [`${BASE}/`]: PUBLIC_HTML,
        [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
        [verifiedUrl()]: EDIT_HTML_SLOT_NO_COUNT,
      },
      [{ position: "header", blocks: [{ id: "b1", isActive: true }] }],
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.failures.join("\n")).toMatch(/no editor-content marker/);
  });

  it("does not fault an app whose workspace has no layout blocks", async () => {
    serveWithWorkspace(
      {
        [`${BASE}/`]: NO_LAYOUT_HTML,
        [`${BASE}/?cmssyEdit=1`]: NO_LAYOUT_HTML,
        [verifiedUrl()]: EDIT_HTML,
      },
      [{ position: "header", blocks: [{ id: "b1", isActive: false }] }],
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.failures).toEqual([]);
  });

  it("stays silent about layouts when the delivery API cannot answer", async () => {
    serveWithWorkspace(
      {
        [`${BASE}/`]: NO_LAYOUT_HTML,
        [`${BASE}/?cmssyEdit=1`]: NO_LAYOUT_HTML,
        [verifiedUrl()]: EDIT_HTML,
      },
      new Error("upstream is down"),
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    // The API being unreachable is not the app's fault, so nothing is claimed
    // about its layouts.
    expect(result.failures.join(" ")).not.toMatch(/layout/);
  });

  it("says so rather than passing quietly when it cannot ask about languages", async () => {
    // The language check disappearing on an outage restores exactly the state
    // this whole check was written against: assertions unreachable, run green,
    // nobody notices. It has to be louder than that.
    serveWithWorkspace(
      {
        [`${BASE}/`]: NO_LAYOUT_HTML,
        [`${BASE}/?cmssyEdit=1`]: NO_LAYOUT_HTML,
        [verifiedUrl()]: EDIT_HTML,
      },
      new Error("upstream is down"),
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain(
      "would not say which languages",
    );
  });
});

describe("checkCmssyEditMode language, asked of the workspace", () => {
  const WORKSPACE = { org: "acme", workspaceSlug: "shop" };
  const DELIVERY = "https://api.cmssy.io/public/acme/shop/graphql";

  /** Answers the site-config probe with a locale set; serves pages by URL. */
  function serveLocales(
    routes: Record<string, string>,
    siteConfig: { defaultLanguage: string; enabledLanguages: string[] } | null,
  ) {
    const fetchStub = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url === DELIVERY) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: String(init?.body ?? "").includes("PublicSiteConfig")
              ? { public: { siteConfig } }
              : { public: { page: { layouts: [] } } },
          }),
          text: async (): Promise<string> => "",
        };
      }
      const body = routes[url];
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        text: async (): Promise<string> => body ?? "",
        json: async () => ({}),
        headers: new Headers({
          "content-security-policy": "frame-ancestors https://cmssy.io",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  const lang = (code: string) =>
    `<html lang="${code}"><div data-cmssy-editor="1" hidden></div><main>hi</main></html>`;

  it("catches a wrong-language preview without being told which language", async () => {
    serveLocales(
      {
        [`${BASE}/`]: "<html lang=\"en\"><main>hi</main></html>",
        [`${BASE}/?cmssyEdit=1`]: "<html lang=\"en\"><main>hi</main></html>",
        [verifiedUrl()]: lang("en"),
        [verifiedUrl("/no")]: lang("en"),
        [verifiedUrl("/cmssy-edit/no")]: lang("en"),
      },
      { defaultLanguage: "en", enabledLanguages: ["en", "no"] },
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.failures.join("\n")).toMatch(
      /edit \/no: the page reports lang="en" but the URL asks for "no"/,
    );
  });

  it("passes the same site once the preview honours the language", async () => {
    serveLocales(
      {
        [`${BASE}/`]: "<html lang=\"en\"><main>hi</main></html>",
        [`${BASE}/?cmssyEdit=1`]: "<html lang=\"en\"><main>hi</main></html>",
        [verifiedUrl()]: lang("en"),
        [verifiedUrl("/no")]: lang("no"),
        [verifiedUrl("/cmssy-edit/no")]: lang("no"),
      },
      { defaultLanguage: "en", enabledLanguages: ["en", "no"] },
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.failures).toEqual([]);
  });

  it("asks nothing about language on a workspace that enables one", async () => {
    const fetchStub = serveLocales(
      {
        [`${BASE}/`]: "<html lang=\"en\"><main>hi</main></html>",
        [`${BASE}/?cmssyEdit=1`]: "<html lang=\"en\"><main>hi</main></html>",
        [verifiedUrl()]: lang("en"),
      },
      { defaultLanguage: "en", enabledLanguages: ["en"] },
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    // No second language exists, so there is no prefixed URL to ask for - and
    // asking for one would 404 on a perfectly correct site.
    expect(result.failures).toEqual([]);
    const asked = fetchStub.mock.calls.map(([url]) => String(url));
    expect(asked.some((url) => url.includes("/en?"))).toBe(false);
  });

  it("says which language it derived when the site serves nothing under it", async () => {
    serveLocales(
      {
        [`${BASE}/`]: "<html lang=\"en\"><main>hi</main></html>",
        [`${BASE}/?cmssyEdit=1`]: "<html lang=\"en\"><main>hi</main></html>",
        [verifiedUrl()]: lang("en"),
      },
      { defaultLanguage: "en", enabledLanguages: ["en", "no"] },
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
    });

    expect(result.failures.join("\n")).toMatch(
      /The workspace enables "no", so the language went unchecked - pass localizedPath/,
    );
  });

  it("uses the path it was given over the one it would derive", async () => {
    const fetchStub = serveLocales(
      {
        [`${BASE}/`]: "<html lang=\"en\"><main>hi</main></html>",
        [`${BASE}/?cmssyEdit=1`]: "<html lang=\"en\"><main>hi</main></html>",
        [verifiedUrl()]: lang("en"),
        [verifiedUrl("/nb-NO")]: lang("nb-NO"),
        [verifiedUrl("/cmssy-edit/nb-NO")]: lang("nb-NO"),
      },
      { defaultLanguage: "en", enabledLanguages: ["en", "no"] },
    );

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      workspace: WORKSPACE,
      localizedPath: "/nb-NO",
    });

    expect(result.failures).toEqual([]);
    const asked = fetchStub.mock.calls.map(([url]) => String(url));
    expect(asked.some((url) => url.includes("/no?"))).toBe(false);
  });
});
