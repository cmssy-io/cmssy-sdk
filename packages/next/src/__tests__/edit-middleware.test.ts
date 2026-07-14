import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  CMSSY_EDIT_PATH_PREFIX,
  cmssyEditRewrite,
  createCmssyEditMiddleware,
} from "../edit-middleware";

const CONFIG = { draftSecret: "draft-secret-1234" };

function request(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(url, "https://site.example"));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("cmssyEditRewrite", () => {
  it("rewrites a VERIFIED cmssyEdit+cmssySecret pair onto the edit route, keeping the path", async () => {
    const res = await cmssyEditRewrite(
      request(`/about/team?cmssyEdit=1&cmssySecret=${CONFIG.draftSecret}`),
      CONFIG,
    );
    expect(res).not.toBeNull();
    expect(res!.headers.get("x-middleware-rewrite")).toContain(
      `${CMSSY_EDIT_PATH_PREFIX}/about/team`,
    );
  });

  it("forwards request headers the middleware resolved, so the editor is not stuck in the default language", async () => {
    // A site whose middleware resolves the locale (per-prefix routing) tells the
    // app through a header. The rewrite dropped it, so the editor preview
    // rendered in the default language while the public page rendered in the
    // visitor's - the same page, two languages.
    const headers = new Headers({ "x-cmssy-locale": "no" });
    const res = await cmssyEditRewrite(
      request(`/shop?cmssyEdit=1&cmssySecret=${CONFIG.draftSecret}`),
      CONFIG,
      { requestHeaders: headers },
    );

    expect(res).not.toBeNull();
    expect(res!.headers.get("x-middleware-override-headers")).toContain(
      "x-cmssy-locale",
    );
    expect(res!.headers.get("x-middleware-request-x-cmssy-locale")).toBe("no");
  });

  it("rewrites the root path without a trailing slash artifact", async () => {
    const res = await cmssyEditRewrite(
      request(`/?cmssyEdit=1&cmssySecret=${CONFIG.draftSecret}`),
      CONFIG,
    );
    expect(res!.headers.get("x-middleware-rewrite")).toContain(
      CMSSY_EDIT_PATH_PREFIX,
    );
    expect(res!.headers.get("x-middleware-rewrite")).not.toContain(
      `${CMSSY_EDIT_PATH_PREFIX}//`,
    );
  });

  it("does not rewrite a bare cmssyEdit=1 (CMS-948: unverified)", async () => {
    expect(
      await cmssyEditRewrite(request("/about?cmssyEdit=1"), CONFIG),
    ).toBeNull();
  });

  it("does not rewrite a wrong secret", async () => {
    expect(
      await cmssyEditRewrite(
        request("/about?cmssyEdit=1&cmssySecret=wrong"),
        CONFIG,
      ),
    ).toBeNull();
  });

  it("does not rewrite draft-mode cookie traffic (draft preview stays on the public route)", async () => {
    expect(
      await cmssyEditRewrite(
        request("/about", { __prerender_bypass: "x" }),
        CONFIG,
      ),
    ).toBeNull();
  });

  it("passes normal traffic through", async () => {
    expect(await cmssyEditRewrite(request("/about"), CONFIG)).toBeNull();
  });

  it("never rewrites a request already on the edit route", async () => {
    expect(
      await cmssyEditRewrite(
        request(
          `${CMSSY_EDIT_PATH_PREFIX}/about?cmssyEdit=1&cmssySecret=${CONFIG.draftSecret}`,
        ),
        CONFIG,
      ),
    ).toBeNull();
  });
});

describe("createCmssyEditMiddleware", () => {
  it("returns NextResponse.next() for public traffic", async () => {
    const middleware = createCmssyEditMiddleware(CONFIG);
    const res = await middleware(request("/pricing"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("returns the rewrite for verified edit traffic", async () => {
    const middleware = createCmssyEditMiddleware(CONFIG);
    const res = await middleware(
      request(`/pricing?cmssyEdit=1&cmssySecret=${CONFIG.draftSecret}`),
    );
    expect(res.headers.get("x-middleware-rewrite")).toContain(
      `${CMSSY_EDIT_PATH_PREFIX}/pricing`,
    );
  });
});
