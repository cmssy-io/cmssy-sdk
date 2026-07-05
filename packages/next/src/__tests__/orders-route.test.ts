import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CMSSY_SESSION_COOKIE, sealSession } from "../session";
import type { CmssyNextConfig } from "../config";

const cookieStore = new Map<string, { value: string }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name)
        ? { name, value: cookieStore.get(name)!.value }
        : undefined,
  })),
}));

import { createCmssyOrdersRoute } from "../create-orders-route";
import { clearWorkspaceIdCache } from "../orders-client";

const SECRET = "s".repeat(32);

const config: CmssyNextConfig = {
  apiUrl: "https://api.test/graphql",
  workspaceSlug: "test-ws",
  draftSecret: "d".repeat(16),
  editorOrigin: "https://app.test",
  auth: { modelSlug: "members", sessionSecret: SECRET },
};

const ORDER = {
  id: "o1",
  status: "pending",
  subtotal: 1000,
  tax: 0,
  total: 1000,
  currency: "PLN",
  customerEmail: "u@x.com",
  refundedAmount: 0,
  paymentProvider: "stripe",
  paymentStatus: "partially_paid",
  fulfillmentStatus: "unfulfilled",
  amountPaid: 600,
  balanceDue: 400,
  paymentReference: "pi_123",
  trackingNumber: null,
  trackingCarrier: null,
  invoiceNumber: "INV-1",
  invoiceUrl: "https://inv.test/INV-1.pdf",
  invoiceProvider: "fakturownia",
  paidAt: null,
  fulfilledAt: null,
  createdAt: "2026-06-13T00:00:00.000Z",
  items: [
    { name: "Widget", price: 1000, currency: "PLN", quantity: 1, sku: null },
  ],
  payments: [
    {
      amount: 600,
      reference: "pi_123",
      provider: "stripe",
      at: "2026-06-13T01:00:00.000Z",
    },
  ],
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
      if (q.includes("publicSiteConfig")) {
        return new Response(
          JSON.stringify({
            data: { publicSiteConfig: { workspaceId: "ws-id-1" } },
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

async function signedInCookie() {
  const sealed = await sealSession(
    {
      accessToken: "member-token",
      refreshToken: "r",
      accessExpiresAt: Date.now() + 60_000,
      user: { recordId: "rec-1", email: "u@x.com" },
    },
    SECRET,
    config.workspaceSlug,
  );
  cookieStore.set(CMSSY_SESSION_COOKIE, { value: sealed });
}

function get(query = "") {
  return new Request(`https://site.test/api/cmssy/orders${query}`);
}

beforeEach(() => {
  cookieStore.clear();
  fetchCalls.length = 0;
  clearWorkspaceIdCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("createCmssyOrdersRoute", () => {
  it("returns 401 when there is no member session", async () => {
    mockFetch({});
    const route = createCmssyOrdersRoute(config);
    const res = await route.GET(get());
    expect(res.status).toBe(401);
    expect(
      fetchCalls.find((c) => String(c.body.query).includes("orders(")),
    ).toBeUndefined();
  });

  it("forwards the member Bearer + workspace id and returns the order list", async () => {
    await signedInCookie();
    mockFetch({
      "orders(": {
        account: { orders: { items: [ORDER], total: 1, hasMore: false } },
      },
    });

    const route = createCmssyOrdersRoute(config);
    const res = await route.GET(get("?limit=10"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [ORDER],
      total: 1,
      hasMore: false,
    });

    const call = fetchCalls.find((c) =>
      String(c.body.query).includes("orders("),
    )!;
    expect(call.headers.get("authorization")).toBe("Bearer member-token");
    expect(call.headers.get("x-workspace-id")).toBe("ws-id-1");
    expect((call.body.variables as { limit: number }).limit).toBe(10);
  });

  it("clamps a client-supplied limit and negative skip", async () => {
    await signedInCookie();
    mockFetch({
      "orders(": {
        account: { orders: { items: [], total: 0, hasMore: false } },
      },
    });

    const route = createCmssyOrdersRoute(config);
    await route.GET(get("?limit=99999&skip=-5"));

    const call = fetchCalls.find((c) =>
      String(c.body.query).includes("orders("),
    )!;
    const vars = call.body.variables as { limit: number; skip: number };
    expect(vars.limit).toBe(100);
    expect(vars.skip).toBe(0);
  });

  it("fetches a single order by id", async () => {
    await signedInCookie();
    mockFetch({ "order(": { account: { order: ORDER } } });

    const route = createCmssyOrdersRoute(config);
    const res = await route.GET(get("?id=o1"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { order: typeof ORDER };
    expect(json).toEqual({ order: ORDER });
    expect(json.order.paymentStatus).toBe("partially_paid");
    expect(json.order.balanceDue).toBe(400);
    expect(json.order.payments).toEqual([
      {
        amount: 600,
        reference: "pi_123",
        provider: "stripe",
        at: "2026-06-13T01:00:00.000Z",
      },
    ]);
    const call = fetchCalls.find((c) =>
      String(c.body.query).includes("order("),
    )!;
    expect((call.body.variables as { id: string }).id).toBe("o1");
    expect(String(call.body.query)).toContain("paymentStatus");
    expect(String(call.body.query)).toContain("balanceDue");
    expect(String(call.body.query)).toContain(
      "payments { amount reference provider at }",
    );
  });
});
