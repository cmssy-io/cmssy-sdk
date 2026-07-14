import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCmssyProxy } from "../preset/proxy";
import { CMSSY_EDIT_HEADER } from "@cmssy/core";
import { CMSSY_LOCALE_HEADER } from "@cmssy/core";

const CONFIG = {
  apiUrl: "https://api.cmssy.io/graphql",
  org: "acme",
  workspaceSlug: "shop",
  draftSecret: "draft-secret-1234",
  editorOrigin: "https://app.cmssy.io",
};

/** The workspace answers "no is default, en is the other one". */
function stubSiteConfig() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          public: {
            siteConfig: {
              defaultLanguage: "no",
              enabledLanguages: ["no", "en"],
            },
          },
        },
      }),
    })),
  );
}

const request = (url: string) => new NextRequest(`https://shop.test${url}`);
const rewrittenTo = (response: Response) =>
  response.headers.get("x-middleware-rewrite");
const forwarded = (response: Response, header: string) =>
  response.headers.get(`x-middleware-request-${header}`);

afterEach(() => vi.unstubAllGlobals());

describe("createCmssyProxy", () => {
  it("sends a verified editor request to the edit route, carrying the language AND the edit flag", async () => {
    // Both of these were forgotten once, separately: without the language the
    // preview renders in the wrong one, without the flag the header and footer
    // are markup the editor can select and cannot fill.
    stubSiteConfig();
    const proxy = createCmssyProxy(CONFIG);

    const response = await proxy(
      request(`/en/about?cmssyEdit=1&cmssySecret=${CONFIG.draftSecret}`),
    );

    expect(rewrittenTo(response)).toContain("/cmssy-edit/en/about");
    expect(forwarded(response, CMSSY_LOCALE_HEADER)).toBe("en");
    expect(forwarded(response, CMSSY_EDIT_HEADER)).toBe("1");
  });

  it("frames the editor: the CSP allows the admin to embed the site", async () => {
    stubSiteConfig();
    const proxy = createCmssyProxy(CONFIG);

    const response = await proxy(
      request(`/?cmssyEdit=1&cmssySecret=${CONFIG.draftSecret}`),
    );

    expect(response.headers.get("Content-Security-Policy")).toContain(
      "https://app.cmssy.io",
    );
  });

  it("refuses a forged edit header from the client", async () => {
    stubSiteConfig();
    const proxy = createCmssyProxy(CONFIG);

    const forgedRequest = request("/about");
    forgedRequest.headers.set(CMSSY_EDIT_HEADER, "1");
    const response = await proxy(forgedRequest);

    expect(forwarded(response, CMSSY_EDIT_HEADER)).toBeNull();
  });

  it("strips a language prefix, asking the workspace which language needs none", async () => {
    // "no" is this workspace's default, so /en is the prefixed one. Assuming
    // English is default here would prefix every URL of a Norwegian-first site.
    stubSiteConfig();
    const proxy = createCmssyProxy(CONFIG, { stripLocalePrefix: true });

    const response = await proxy(request("/en/shop/cart"));

    expect(rewrittenTo(response)).toContain("/shop/cart");
    expect(forwarded(response, CMSSY_LOCALE_HEADER)).toBe("en");
  });

  it("leaves the default language's URLs alone", async () => {
    stubSiteConfig();
    const proxy = createCmssyProxy(CONFIG, { stripLocalePrefix: true });

    const response = await proxy(request("/shop/cart"));

    expect(rewrittenTo(response)).toBeNull();
    expect(forwarded(response, CMSSY_LOCALE_HEADER)).toBe("no");
  });
});
