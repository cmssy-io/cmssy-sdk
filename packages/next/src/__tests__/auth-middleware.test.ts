import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createCmssyAuthMiddleware } from "../auth-middleware";
import { clearWorkspaceIdCache } from "../auth-client";
import {
  CMSSY_SESSION_COOKIE,
  sealSession,
  openSession,
  type CmssySessionPayload,
} from "../session";
import type { CmssyNextConfig } from "../config";

const SECRET = "m".repeat(32);

const config: CmssyNextConfig = {
  apiUrl: "https://api.test/graphql",
  org: "acme", workspaceSlug: "test-ws",
  draftSecret: "d".repeat(16),
  editorOrigin: "https://app.test",
  auth: { modelSlug: "members", sessionSecret: SECRET },
};

function fakeAccessToken(): string {
  const body = Buffer.from(
    JSON.stringify({
      type: "site_member",
      recordId: "rec-1",
      email: "u@x.com",
    }),
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${body}.sig`;
}

const gqlResponses: Array<Record<string, unknown>> = [];

beforeEach(() => {
  gqlResponses.length = 0;
  clearWorkspaceIdCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (String(body.query).includes("PublicSiteConfig")) {
        return new Response(
          JSON.stringify({
            data: { public: { siteConfig: { workspaceId: "ws-id-1" } } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      const next = gqlResponses.shift() ?? {};
      return new Response(JSON.stringify({ data: next }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

async function requestWithSession(
  overrides: Partial<CmssySessionPayload> = {},
): Promise<NextRequest> {
  const payload: CmssySessionPayload = {
    accessToken: fakeAccessToken(),
    refreshToken: "refresh-1",
    accessExpiresAt: Date.now() + 10 * 60_000,
    user: { recordId: "rec-1", email: "u@x.com" },
    ...overrides,
  };
  const sealed = await sealSession(payload, SECRET, config.workspaceSlug);
  return new NextRequest("https://site.test/account", {
    headers: { cookie: `${CMSSY_SESSION_COOKIE}=${sealed}` },
  });
}

describe("createCmssyAuthMiddleware", () => {
  it("passes through without a cookie", async () => {
    const middleware = createCmssyAuthMiddleware(config);
    const response = await middleware(
      new NextRequest("https://site.test/account"),
    );
    expect(response.cookies.get(CMSSY_SESSION_COOKIE)).toBeUndefined();
  });

  it("passes through a fresh session untouched", async () => {
    const middleware = createCmssyAuthMiddleware(config);
    const response = await middleware(await requestWithSession());
    expect(response.cookies.get(CMSSY_SESSION_COOKIE)).toBeUndefined();
  });

  it("clears a corrupted cookie", async () => {
    const middleware = createCmssyAuthMiddleware(config);
    const request = new NextRequest("https://site.test/account", {
      headers: { cookie: `${CMSSY_SESSION_COOKIE}=garbage` },
    });
    const response = await middleware(request);
    expect(response.cookies.get(CMSSY_SESSION_COOKIE)?.value).toBe("");
  });

  it("refreshes an expired session onto the response AND the request", async () => {
    gqlResponses.push({
      siteMemberRefresh: {
        success: true,
        message: "ok",
        accessToken: fakeAccessToken(),
        refreshToken: "refresh-2",
        accessTokenExpiresIn: 900,
      },
    });
    const middleware = createCmssyAuthMiddleware(config);
    const request = await requestWithSession({
      accessExpiresAt: Date.now() - 1000,
    });
    const response = await middleware(request);

    const responseCookie = response.cookies.get(CMSSY_SESSION_COOKIE);
    expect(responseCookie?.value).toBeTruthy();
    const opened = await openSession(
      responseCookie!.value,
      SECRET,
      config.workspaceSlug,
    );
    expect(opened?.refreshToken).toBe("refresh-2");

    const requestCookie = request.cookies.get(CMSSY_SESSION_COOKIE);
    const openedRequest = await openSession(
      requestCookie!.value,
      SECRET,
      config.workspaceSlug,
    );
    expect(openedRequest?.refreshToken).toBe("refresh-2");
  });

  it("clears the cookie on a definitive backend rejection", async () => {
    gqlResponses.push({
      siteMemberRefresh: {
        success: false,
        message: "Invalid credentials.",
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresIn: null,
      },
    });
    const middleware = createCmssyAuthMiddleware(config);
    const response = await middleware(
      await requestWithSession({ accessExpiresAt: Date.now() - 1000 }),
    );
    expect(response.cookies.get(CMSSY_SESSION_COOKIE)?.value).toBe("");
  });

  it("skips refresh for prefetch requests", async () => {
    gqlResponses.push({
      siteMemberRefresh: {
        success: true,
        message: "ok",
        accessToken: fakeAccessToken(),
        refreshToken: "refresh-2",
        accessTokenExpiresIn: 900,
      },
    });
    const middleware = createCmssyAuthMiddleware(config);
    const request = await requestWithSession({
      accessExpiresAt: Date.now() - 1000,
    });
    request.headers.set("next-router-prefetch", "1");
    const response = await middleware(request);
    expect(response.cookies.get(CMSSY_SESSION_COOKIE)).toBeUndefined();
    expect(gqlResponses).toHaveLength(1);
  });

  it("keeps the stale session when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        if (String(body.query).includes("PublicSiteConfig")) {
          return new Response(
            JSON.stringify({
              data: { public: { siteConfig: { workspaceId: "ws-id-1" } } },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error("network down");
      }),
    );
    const middleware = createCmssyAuthMiddleware(config);
    const response = await middleware(
      await requestWithSession({ accessExpiresAt: Date.now() - 1000 }),
    );
    expect(response.cookies.get(CMSSY_SESSION_COOKIE)).toBeUndefined();
  });
});
