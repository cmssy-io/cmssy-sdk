import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  CMSSY_EDIT_PATH_PREFIX,
  cmssyEditRewrite,
  createCmssyEditMiddleware,
} from "../edit-middleware";

function request(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(url, "https://site.example"));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("cmssyEditRewrite", () => {
  it("rewrites ?cmssyEdit=1 onto the edit route, keeping the path", () => {
    const res = cmssyEditRewrite(request("/about/team?cmssyEdit=1"));
    expect(res).not.toBeNull();
    expect(res!.headers.get("x-middleware-rewrite")).toContain(
      `${CMSSY_EDIT_PATH_PREFIX}/about/team`,
    );
  });

  it("rewrites the root path without a trailing slash artifact", () => {
    const res = cmssyEditRewrite(request("/?cmssyEdit=1"));
    expect(res!.headers.get("x-middleware-rewrite")).toContain(
      CMSSY_EDIT_PATH_PREFIX,
    );
    expect(res!.headers.get("x-middleware-rewrite")).not.toContain(
      `${CMSSY_EDIT_PATH_PREFIX}//`,
    );
  });

  it("rewrites when the draft-mode bypass cookie is present", () => {
    const res = cmssyEditRewrite(
      request("/about", { __prerender_bypass: "x" }),
    );
    expect(res).not.toBeNull();
  });

  it("passes normal traffic through", () => {
    expect(cmssyEditRewrite(request("/about"))).toBeNull();
    expect(cmssyEditRewrite(request("/about?cmssyEdit=0"))).toBeNull();
  });

  it("never rewrites a request already on the edit route", () => {
    expect(
      cmssyEditRewrite(request(`${CMSSY_EDIT_PATH_PREFIX}/about?cmssyEdit=1`)),
    ).toBeNull();
  });
});

describe("createCmssyEditMiddleware", () => {
  it("returns NextResponse.next() for public traffic", () => {
    const middleware = createCmssyEditMiddleware();
    const res = middleware(request("/pricing"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("returns the rewrite for edit traffic", () => {
    const middleware = createCmssyEditMiddleware();
    const res = middleware(request("/pricing?cmssyEdit=1"));
    expect(res.headers.get("x-middleware-rewrite")).toContain(
      `${CMSSY_EDIT_PATH_PREFIX}/pricing`,
    );
  });
});
