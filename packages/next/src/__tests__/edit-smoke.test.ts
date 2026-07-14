import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCmssyEditMode } from "../testing/edit-smoke";

const BASE = "http://localhost:3000";
const SECRET = "draft-secret-1234";

const PUBLIC_HTML = "<html><header>MACHTEC</header><main>hi</main></html>";
const EDIT_HTML = "<html><script>CmssyEditor</script><main>hi</main></html>";

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

  it("does not require layout blocks: a site without chrome is valid", async () => {
    const bare = "<html><main>hi</main></html>";
    serve({
      [`${BASE}/`]: bare,
      [`${BASE}/?cmssyEdit=1`]: bare,
      [verifiedUrl()]: "<html><script>CmssyEditor</script><main>hi</main></html>",
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

  it("fails when the chrome is still server-rendered in edit mode (CMS-970)", async () => {
    // The editor selects the header and has no fields for it: the blocks never
    // reached the edit bridge.
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: `<html><script>CmssyEditor</script><header>MACHTEC</header></html>`,
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
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]: EDIT_HTML, // editor is there, Norwegian is not
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
      localizedMarker: "Handlekurv",
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("default language");
  });

  it("passes when the localized preview speaks the language its URL asks for", async () => {
    serve({
      [`${BASE}/`]: PUBLIC_HTML,
      [`${BASE}/?cmssyEdit=1`]: PUBLIC_HTML,
      [verifiedUrl()]: EDIT_HTML,
      [verifiedUrl("/no")]:
        "<html><script>CmssyEditor</script><main>Handlekurv</main></html>",
    });

    const result = await checkCmssyEditMode({
      baseUrl: BASE,
      secret: SECRET,
      localizedPath: "/no",
      localizedMarker: "Handlekurv",
    });

    expect(result.failures).toEqual([]);
  });
});
