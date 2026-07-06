import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CMSSY_SESSION_COOKIE, sealSession } from "../session";
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

import { createCmssyCartRoute, CMSSY_CART_COOKIE } from "../create-cart-route";
import { clearCartWorkspaceIdCache } from "../cart-client";

const SECRET = "s".repeat(32);

const config: CmssyNextConfig = {
  apiUrl: "https://api.test/graphql",
  org: "acme", workspaceSlug: "test-ws",
  draftSecret: "d".repeat(16),
  editorOrigin: "https://app.test",
  auth: { modelSlug: "members", sessionSecret: SECRET },
};

const EMPTY_CART = {
  id: "c1",
  status: "active",
  itemCount: 0,
  subtotal: 0,
  currency: null,
  discountedTotal: 0,
  appliedDiscount: null,
  items: [],
};

const fetchCalls: Array<{ body: Record<string, unknown>; headers: Headers }> =
  [];

function mockFetch(payloads: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      fetchCalls.push({ body, headers: new Headers(init?.headers) });
      const q = String(body.query);
      if (q.includes("PublicSiteConfig")) {
        return new Response(
          JSON.stringify({
            data: { public: { siteConfig: { workspaceId: "ws-id-1" } } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      const key = Object.keys(payloads).find((k) => q.includes(k)) ?? "";
      return new Response(JSON.stringify({ data: payloads[key] ?? {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function post(action: string, body: unknown = {}) {
  return [
    new Request(`https://site.test/api/cmssy/cart/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ action }) },
  ] as const;
}

beforeEach(() => {
  cookieStore.clear();
  fetchCalls.length = 0;
  clearCartWorkspaceIdCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("createCmssyCartRoute", () => {
  it("mints a cart-session cookie and forwards the token to cmssy", async () => {
    mockFetch({ "get(": { cart: { get: EMPTY_CART } } });
    const route = createCmssyCartRoute(config);
    const res = await route.POST(...post("cart"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cart: EMPTY_CART });

    const cookie = cookieStore.get(CMSSY_CART_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(cookie!.options).toMatchObject({ httpOnly: true, sameSite: "lax" });

    const cartFetch = fetchCalls.find((c) =>
      String(c.body.query).includes("get("),
    )!;
    expect(cartFetch.headers.get("x-cart-session")).toBe(cookie!.value);
    expect(cartFetch.headers.get("x-workspace-id")).toBe("ws-id-1");
    expect(cartFetch.headers.get("authorization")).toBeNull();
  });

  it("reuses an existing cart-session cookie", async () => {
    cookieStore.set(CMSSY_CART_COOKIE, { value: "x".repeat(43) });
    mockFetch({ "get(": { cart: { get: EMPTY_CART } } });
    const route = createCmssyCartRoute(config);
    await route.POST(...post("cart"));
    const cartFetch = fetchCalls.find((c) =>
      String(c.body.query).includes("get("),
    )!;
    expect(cartFetch.headers.get("x-cart-session")).toBe("x".repeat(43));
  });

  it("forwards the member access token when an auth session is present", async () => {
    const sealed = await sealSession(
      {
        accessToken: "member-access-token",
        refreshToken: "r",
        accessExpiresAt: Date.now() + 60_000,
        user: { recordId: "rec-1", email: "u@x.com" },
      },
      SECRET,
      config.workspaceSlug,
    );
    cookieStore.set(CMSSY_SESSION_COOKIE, { value: sealed });
    mockFetch({ addItem: { cart: { addItem: EMPTY_CART } } });

    const route = createCmssyCartRoute(config);
    const res = await route.POST(
      ...post("add", { recordId: "r1", quantity: 1 }),
    );
    expect(res.status).toBe(200);
    const addFetch = fetchCalls.find((c) =>
      String(c.body.query).includes("addItem"),
    )!;
    expect(addFetch.headers.get("authorization")).toBe(
      "Bearer member-access-token",
    );
    const vars = addFetch.body.variables as { input: Record<string, unknown> };
    expect(vars.input.workspaceId).toBe("ws-id-1");
    expect(vars.input.recordId).toBe("r1");
  });

  it("clears the cart cookie after checkout", async () => {
    cookieStore.set(CMSSY_CART_COOKIE, { value: "y".repeat(43) });
    mockFetch({
      checkout: {
        cart: { checkout: { id: "o1", status: "pending", total: 0 } },
      },
    });
    const route = createCmssyCartRoute(config);
    const res = await route.POST(
      ...post("checkout", { customerEmail: "b@example.com" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ order: { id: "o1" } });
    expect(cookieStore.get(CMSSY_CART_COOKIE)!.options).toMatchObject({
      maxAge: 0,
    });
  });

  it("returns 404 for an unknown action", async () => {
    mockFetch({});
    const route = createCmssyCartRoute(config);
    const res = await route.POST(...post("bogus"));
    expect(res.status).toBe(404);
  });

  it("maps a backend error to 502", async () => {
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
        return new Response(
          JSON.stringify({ errors: [{ message: "Out of stock" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const route = createCmssyCartRoute(config);
    const res = await route.POST(
      ...post("add", { recordId: "r1", quantity: 9 }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain("Out of stock");
  });
});
