import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCmssyEditMode } from "../testing/edit-smoke";

const BASE = "http://localhost:3000";
const SECRET = "draft-secret-1234";

const PUBLIC_HTML = "<html><header>MACHTEC</header><main>hi</main></html>";
const EDITOR = '<div data-cmssy-editor="1" hidden></div>';
const EDIT_HTML = '<html><div data-cmssy-editor="1" hidden></div><main>hi</main></html>';

/** Serves a body per URL; anything unrouted 404s, which the check reports. */
function serve(routes: Record<string, string>) {
  const fetchStub = vi.fn(async (url: string) => {
    const body = routes[url];
    return {
      status: body === undefined ? 404 : 200,
      text: async () => body ?? "",
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
});
