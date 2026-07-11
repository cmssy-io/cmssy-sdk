import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CMSSY_SESSION_COOKIE,
  sealSession,
  openSession,
  type CmssySessionPayload,
} from "../session";
import type { CmssyNextConfig } from "../config";

const cookieStore = new Map<string, { value: string; options?: unknown }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name)
        ? { name, value: cookieStore.get(name)!.value }
        : undefined,
    set: (name: string, value: string, options?: unknown) => {
      cookieStore.set(name, { value, options });
    },
  })),
}));

import { createCmssyAuthRoute } from "../create-auth-route";
import { assertAuthConfig } from "../config";
import { getCmssyUser, getCmssyAccessToken } from "../auth-server";
import { clearWorkspaceIdCache, decodeAccessClaims } from "../auth-client";

const SECRET = "s".repeat(32);

const config: CmssyNextConfig = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "test-ws",
  draftSecret: "d".repeat(16),
  editorOrigin: "https://app.test",
  auth: { modelSlug: "members", sessionSecret: SECRET },
};

function fakeAccessToken(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${body}.sig`;
}

const ACCESS = fakeAccessToken({
  type: "site_member",
  recordId: "rec-1",
  email: "u@x.com",
});

const gqlResponses: Array<Record<string, unknown>> = [];
const fetchCalls: Array<{ body: Record<string, unknown>; headers: Headers }> =
  [];

function mockFetch() {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    fetchCalls.push({ body, headers: new Headers(init?.headers) });
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
  });
}

function post(
  action: string,
  body: unknown,
): [Request, { params: Promise<{ action: string }> }] {
  return [
    new Request(`https://site.test/api/cmssy/auth/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ action }) },
  ];
}

async function seedSession(
  overrides: Partial<CmssySessionPayload> = {},
): Promise<CmssySessionPayload> {
  const payload: CmssySessionPayload = {
    accessToken: ACCESS,
    refreshToken: "refresh-1",
    accessExpiresAt: Date.now() + 10 * 60_000,
    user: { recordId: "rec-1", email: "u@x.com" },
    ...overrides,
  };
  cookieStore.set(CMSSY_SESSION_COOKIE, {
    value: await sealSession(payload, SECRET, config.workspaceSlug),
  });
  return payload;
}

beforeEach(() => {
  cookieStore.clear();
  gqlResponses.length = 0;
  fetchCalls.length = 0;
  clearWorkspaceIdCache();
  vi.stubGlobal("fetch", mockFetch());
});

describe("assertAuthConfig", () => {
  it("throws without auth config", () => {
    expect(() => assertAuthConfig({ ...config, auth: undefined })).toThrow(
      /modelSlug/,
    );
  });

  it("throws on a short sessionSecret", () => {
    expect(() =>
      assertAuthConfig({
        ...config,
        auth: { modelSlug: "members", sessionSecret: "short" },
      }),
    ).toThrow(/32/);
  });
});

describe("sign-in", () => {
  it("sets the session cookie and returns only the user", async () => {
    gqlResponses.push({
      siteMember: {
        login: {
          success: true,
          message: "ok",
          accessToken: ACCESS,
          refreshToken: "refresh-1",
          accessTokenExpiresIn: 900,
        },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(
      ...post("sign-in", { identity: "u@x.com", password: "Password123" }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      ok: true,
      user: { recordId: "rec-1", email: "u@x.com" },
    });
    expect(JSON.stringify(body)).not.toContain(ACCESS);
    expect(JSON.stringify(body)).not.toContain("refresh-1");

    const sealed = cookieStore.get(CMSSY_SESSION_COOKIE)!.value;
    const opened = await openSession(sealed, SECRET, config.workspaceSlug);
    expect(opened?.accessToken).toBe(ACCESS);
    expect(opened?.refreshToken).toBe("refresh-1");

    const loginCall = fetchCalls.find((c) =>
      String(c.body.query).includes("SiteMemberLogin"),
    );
    expect(loginCall?.headers.get("x-workspace-id")).toBe("ws-id-1");
  });

  it("returns 401 without a cookie on failed credentials", async () => {
    gqlResponses.push({
      siteMember: {
        login: {
          success: false,
          message: "Invalid credentials.",
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresIn: null,
        },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(
      ...post("sign-in", { identity: "u@x.com", password: "bad" }),
    );
    expect(res.status).toBe(401);
    expect(cookieStore.has(CMSSY_SESSION_COOKIE)).toBe(false);
  });

  it("rejects missing fields with 400", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("sign-in", { identity: "u@x.com" }));
    expect(res.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("refresh", () => {
  it("rotates the cookie and returns only the user", async () => {
    await seedSession();
    const newAccess = fakeAccessToken({
      type: "site_member",
      recordId: "rec-1",
      email: "u@x.com",
    });
    gqlResponses.push({
      siteMember: {
        refresh: {
          success: true,
          message: "ok",
          accessToken: newAccess,
          refreshToken: "refresh-2",
          accessTokenExpiresIn: 900,
        },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("refresh", {}));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body)).not.toContain("refresh-2");

    const opened = await openSession(
      cookieStore.get(CMSSY_SESSION_COOKIE)!.value,
      SECRET,
      config.workspaceSlug,
    );
    expect(opened?.refreshToken).toBe("refresh-2");
  });

  it("clears the cookie and 401s when the backend rejects", async () => {
    await seedSession();
    gqlResponses.push({
      siteMember: {
        refresh: {
          success: false,
          message: "Invalid credentials.",
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresIn: null,
        },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("refresh", {}));
    expect(res.status).toBe(401);
    expect(cookieStore.get(CMSSY_SESSION_COOKIE)?.value).toBe("");
  });

  it("401s without a session", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("refresh", {}));
    expect(res.status).toBe(401);
  });
});

describe("sign-out", () => {
  it("clears the cookie and awaits the backend logout", async () => {
    await seedSession();
    gqlResponses.push({
      siteMember: { logout: { success: true, message: "ok" } },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("sign-out", {}));
    expect((await res.json()).ok).toBe(true);
    expect(cookieStore.get(CMSSY_SESSION_COOKIE)?.value).toBe("");
    expect(
      fetchCalls.some((c) =>
        String(c.body.query).includes("mutation SiteMemberLogout("),
      ),
    ).toBe(true);
  });

  it("succeeds without a session", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("sign-out", {}));
    expect((await res.json()).ok).toBe(true);
  });
});

describe("me", () => {
  it("returns the user for a valid session", async () => {
    await seedSession();
    const { GET } = createCmssyAuthRoute(config);
    const res = await GET(...post("me", {}));
    expect(await res.json()).toEqual({
      user: { recordId: "rec-1", email: "u@x.com" },
    });
  });

  it("refreshes an expired session then returns the user", async () => {
    await seedSession({ accessExpiresAt: Date.now() - 1000 });
    gqlResponses.push({
      siteMember: {
        refresh: {
          success: true,
          message: "ok",
          accessToken: ACCESS,
          refreshToken: "refresh-2",
          accessTokenExpiresIn: 900,
        },
      },
    });
    const { GET } = createCmssyAuthRoute(config);
    const res = await GET(...post("me", {}));
    expect((await res.json()).user.email).toBe("u@x.com");
    const opened = await openSession(
      cookieStore.get(CMSSY_SESSION_COOKIE)!.value,
      SECRET,
      config.workspaceSlug,
    );
    expect(opened?.refreshToken).toBe("refresh-2");
  });

  it("returns null user without a session", async () => {
    const { GET } = createCmssyAuthRoute(config);
    const res = await GET(...post("me", {}));
    expect(await res.json()).toEqual({ user: null });
  });
});

describe("unknown action + body guards", () => {
  it("404s an unknown action", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("nope", {}));
    expect(res.status).toBe(404);
  });

  it("400s a non-object body", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("sign-in", [1, 2]));
    expect(res.status).toBe(400);
  });
});

describe("getCmssyUser / getCmssyAccessToken (RSC, no rotation)", () => {
  it("returns the user for a fresh session", async () => {
    await seedSession();
    expect(await getCmssyUser(config)).toEqual({
      recordId: "rec-1",
      email: "u@x.com",
    });
    expect(await getCmssyAccessToken(config)).toBe(ACCESS);
  });

  it("returns null for an expired session WITHOUT calling the backend", async () => {
    await seedSession({ accessExpiresAt: Date.now() - 1000 });
    expect(await getCmssyUser(config)).toBeNull();
    expect(
      fetchCalls.filter((c) =>
        String(c.body.query).includes("SiteMemberRefresh"),
      ),
    ).toHaveLength(0);
  });

  it("returns null without a cookie", async () => {
    expect(await getCmssyUser(config)).toBeNull();
    expect(await getCmssyAccessToken(config)).toBeNull();
  });
});

describe("decodeAccessClaims", () => {
  it("decodes site_member claims", () => {
    expect(decodeAccessClaims(ACCESS)).toEqual({
      recordId: "rec-1",
      email: "u@x.com",
    });
  });

  it("rejects non-site_member tokens and garbage", () => {
    expect(
      decodeAccessClaims(
        fakeAccessToken({ type: "access", recordId: "r", email: "e@x.com" }),
      ),
    ).toBeNull();
    expect(decodeAccessClaims("garbage")).toBeNull();
  });
});

describe("token-based handlers relay backend results", () => {
  it("register relays success + message without auto-login", async () => {
    gqlResponses.push({
      siteMember: {
        register: { success: true, message: "Check your email." },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(
      ...post("register", { identity: "n@x.com", password: "Password123" }),
    );
    expect(await res.json()).toEqual({
      ok: true,
      message: "Check your email.",
    });
    expect(cookieStore.has(CMSSY_SESSION_COOKIE)).toBe(false);
  });

  it("register 400s on missing fields", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("register", { identity: "n@x.com" }));
    expect(res.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it("forgot-password relays generic success", async () => {
    gqlResponses.push({
      siteMember: {
        forgotPassword: { success: true, message: "If an account…" },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("forgot-password", { identity: "n@x.com" }));
    expect((await res.json()).ok).toBe(true);
    const call = fetchCalls.find((c) =>
      String(c.body.query).includes("SiteMemberForgotPassword"),
    );
    expect((call?.body.variables as Record<string, unknown>).modelSlug).toBe(
      "members",
    );
  });

  it("reset-password relays the backend verdict", async () => {
    gqlResponses.push({
      siteMember: {
        resetPassword: { success: true, message: "Password updated." },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(
      ...post("reset-password", {
        token: "t".repeat(64),
        newPassword: "New1pass",
      }),
    );
    expect((await res.json()).ok).toBe(true);
  });

  it("reset-password 400s without token/newPassword", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("reset-password", { token: "x" }));
    expect(res.status).toBe(400);
  });

  it("verify-email relays the backend verdict", async () => {
    gqlResponses.push({
      siteMember: {
        verifyEmail: { success: true, message: "Verified." },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("verify-email", { token: "t".repeat(64) }));
    expect((await res.json()).ok).toBe(true);
  });
});

describe("sign-out-everywhere", () => {
  it("sends the access token and clears the cookie", async () => {
    await seedSession();
    gqlResponses.push({
      siteMember: {
        logoutEverywhere: { success: true, message: "ok" },
      },
    });
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("sign-out-everywhere", {}));
    expect((await res.json()).ok).toBe(true);
    expect(cookieStore.get(CMSSY_SESSION_COOKIE)?.value).toBe("");
    const call = fetchCalls.find((c) =>
      String(c.body.query).includes("SiteMemberLogoutEverywhere"),
    );
    expect(call?.headers.get("authorization")).toBe(`Bearer ${ACCESS}`);
  });

  it("clears the cookie even without a session", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const res = await POST(...post("sign-out-everywhere", {}));
    expect((await res.json()).ok).toBe(true);
  });
});

describe("content-type guard", () => {
  it("400s a non-JSON content-type (form CSRF smuggling)", async () => {
    const { POST } = createCmssyAuthRoute(config);
    const request = new Request("https://site.test/api/cmssy/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ identity: "a@x.com", password: "Password123" }),
      headers: { "content-type": "text/plain" },
    });
    const res = await POST(request, {
      params: Promise.resolve({ action: "sign-in" }),
    });
    expect(res.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });
});
