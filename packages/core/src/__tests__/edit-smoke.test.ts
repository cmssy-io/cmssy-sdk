import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCmssyEditMode } from "../testing/edit-smoke";

const BASE = "http://localhost:3000";
const SECRET = "draft-secret-1234";

const PUBLIC_HTML = "<html><header>MACHTEC</header><main>hi</main></html>";
const EDITOR = '<div data-cmssy-editor="1" hidden></div>';
const EDIT_HTML =
  '<html><div data-cmssy-editor="1" hidden></div><main>hi</main></html>';
const EDIT_HTML_WITH_SLOT =
  '<html><div data-cmssy-editor="1" hidden></div><div data-cmssy-layout-slot="header" data-cmssy-editor-content="2" hidden></div><main>hi</main></html>';

const EDIT_HTML_SLOT_EMPTY =
  '<html><div data-cmssy-editor="1" hidden></div><div data-cmssy-layout-slot="header" data-cmssy-editor-content="0" hidden></div><main>hi</main></html>';

const EDIT_HTML_SLOT_NO_COUNT =
  '<html><div data-cmssy-editor="1" hidden></div><div data-cmssy-layout-slot="header" hidden></div><main>hi</main></html>';

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
      [verifiedUrl()]:
        '<html><div data-cmssy-editor="1" hidden></div><main>hi</main></html>',
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.failures).toEqual([]);
  });

  it("fails when the verified request renders no editor - the /cmssy-edit route is missing (CMS-969)", async () => {
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
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="en">${EDITOR}<main>hi</main></html>`,
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
        [verifiedUrl("/cmssy-edit/no")]:
          `<html lang="no">${EDITOR}<main>hi</main></html>`,
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
    const noHeaders = vi.fn(async (url: string) => {
      const routes: Record<string, string> = {
        [`${BASE}/`]: PUBLIC_HTML,
        [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
        [verifiedUrl()]: EDIT_HTML,
        [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
        [verifiedUrl("/cmssy-edit/no")]:
          `<html lang="no">${EDITOR}<main>hi</main></html>`,
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
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="no">${EDITOR}<main>hi</main></html>`,
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
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="no">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.failures).toEqual([]);
  });

  it("reads the language of an edit-route path off the segment after the prefix", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="no">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/cmssy-edit/no",
    });

    expect(result.failures).toEqual([]);
  });
});

describe("checkCmssyEditMode with expectLayoutBlocks", () => {
  const NO_LAYOUT_HTML = "<html><main>hi</main></html>";

  it("fails an app that mounts no editable layout slot", async () => {
    serve({
      [`${BASE}/`]: NO_LAYOUT_HTML,
      [`${BASE}/?cmssyEdit=1`]: NO_LAYOUT_HTML,
      [verifiedUrl()]: EDIT_HTML,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      expectLayoutBlocks: true,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/no editable layout slot/);
  });

  it("passes the same app once it mounts the layout slot", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML_WITH_SLOT,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      expectLayoutBlocks: true,
    });

    expect(result.failures).toEqual([]);
  });

  it("fails a slot that is mounted but resolved nothing - it is not in edit mode", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML_SLOT_EMPTY,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      expectLayoutBlocks: true,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/resolved 0 blocks/);
  });

  it("fails a consumer whose slot emits no count at all", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML_SLOT_NO_COUNT,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      expectLayoutBlocks: true,
    });

    expect(result.failures.join("\n")).toMatch(/no editor-content marker/);
  });

  it("reports the layout assertions it did not run", async () => {
    serve({
      [`${BASE}/`]: NO_LAYOUT_HTML,
      [`${BASE}/?cmssyEdit=1`]: NO_LAYOUT_HTML,
      [verifiedUrl()]: EDIT_HTML,
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.ok).toBe(true);
    expect(result.skipped.join("\n")).toMatch(/expectLayoutBlocks is not set/);
    expect(result.skipped.join("\n")).toMatch(/no <header> or <footer>/);
    expect(result.skipped.join("\n")).toMatch(/no localizedPath/);
  });

  it("claims no skip for the assertions it did run", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML_WITH_SLOT,
      [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="no">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl("/cmssy-edit")]: EDIT_HTML_WITH_SLOT,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      expectLayoutBlocks: true,
      localizedPath: "/no",
    });

    expect(result.failures).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("reports the direct edit route as skipped when the adapter has none", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML_WITH_SLOT,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      expectLayoutBlocks: true,
      editRoute: false,
    });

    expect(result.failures).toEqual([]);
    const skipped = result.skipped.join("\n");
    expect(skipped).toMatch(/no \/cmssy-edit route to reach directly/);
    expect(skipped).toMatch(/nothing to fix/);
  });

  it("says nothing about layout slots when the caller does not claim any", async () => {
    serve({
      [`${BASE}/`]: NO_LAYOUT_HTML,
      [`${BASE}/?cmssyEdit=1`]: NO_LAYOUT_HTML,
      [verifiedUrl()]: EDIT_HTML,
    });

    const result = await checkCmssyEditMode({ baseUrl: BASE, secret: SECRET });

    expect(result.failures).toEqual([]);
  });

  it("reaches the app only - no delivery API request", async () => {
    const fetchStub = serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML_WITH_SLOT,
    });

    await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      expectLayoutBlocks: true,
    });

    for (const [url] of fetchStub.mock.calls) {
      expect(String(url).startsWith(BASE)).toBe(true);
    }
  });
});

describe("checkCmssyEditMode on an adapter with no edit route", () => {
  it("does not compare a page slugged like the edit path against the real one", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="en">${EDITOR}<h1>Not found</h1></html>`,
      [verifiedUrl("/cmssy-edit")]:
        `<html lang="en">${EDITOR}<h1>Not found</h1></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
      editRoute: false,
    });

    expect(result.failures).toEqual([]);
  });

  it("still reports it for an adapter that does mount one", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]: `<html lang="no">${EDITOR}<main>hi</main></html>`,
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="en">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
    });

    expect(result.failures.join(" ")).toContain("two languages");
  });
});

describe("checkCmssyEditMode given the edit route as the localized path", () => {
  it("does not fetch it twice and compare it against itself", async () => {
    const fetchStub = serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/cmssy-edit")]: EDIT_HTML,
      [verifiedUrl("/cmssy-edit/no")]:
        `<html lang="no">${EDITOR}<main>hi</main></html>`,
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/cmssy-edit/no",
    });

    expect(result.failures).toEqual([]);
    const asked = fetchStub.mock.calls.map(([url]) => String(url));
    const edits = asked.filter((url) => url.includes("/cmssy-edit/no"));
    expect(edits).toHaveLength(1);
  });
});
