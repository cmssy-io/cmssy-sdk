import { describe, expect, it } from "vitest";
import type { FetchLike } from "../content/content-client";
import {
  CMSSY_BUYER_PRICES_MAX_ITEMS,
  getBuyerPrices,
  type CmssyBuyerPrice,
} from "../data/buyer-prices";
import {
  checkoutErrorReason,
  checkoutErrorReasonValues,
} from "../data/checkout-errors";
import { graphqlRequest } from "../data/graphql-request";
import { CmssyGraphqlError, CmssyRequestError } from "../data/http";

const config = {
  apiUrl: "https://api.test/graphql",
  org: "acme",
  workspaceSlug: "ws",
};

interface Call {
  url: string;
  headers: Record<string, string>;
  query: string;
  variables: Record<string, unknown>;
}

function capturingFetch(payload: unknown): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, ...JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, calls };
}

const RANGE: CmssyBuyerPrice = {
  recordId: "p1",
  variantKey: null,
  currency: "EUR",
  price: 900,
  priceMax: 1200,
  listed: true,
  tiers: [],
};

const VARIANT: CmssyBuyerPrice = {
  recordId: "p2",
  variantKey: "v1",
  currency: "EUR",
  price: 500,
  priceMax: null,
  listed: false,
  tiers: [{ minQty: 10, price: 450 }],
};

describe("getBuyerPrices", () => {
  it("asks the org-scoped delivery route with the member's token and returns the rows", async () => {
    const { fetch, calls } = capturingFetch({
      data: { account: { prices: [RANGE, VARIANT] } },
    });

    const prices = await getBuyerPrices(
      config,
      [{ recordId: "p1" }, { recordId: "p2", variantKey: "v1" }],
      { workspaceId: "w1", accessToken: "tok", fetch },
    );

    expect(prices).toEqual([RANGE, VARIANT]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.test/public/acme/ws/graphql");
    expect(calls[0]?.headers.authorization).toBe("Bearer tok");
    expect(calls[0]?.headers["x-workspace-id"]).toBe("w1");
    expect(calls[0]?.query).toContain("query BuyerPrices");
    expect(calls[0]?.variables).toEqual({
      workspaceId: "w1",
      items: [{ recordId: "p1" }, { recordId: "p2", variantKey: "v1" }],
    });
  });

  it("drops an empty or null variantKey rather than sending it", async () => {
    const { fetch, calls } = capturingFetch({
      data: { account: { prices: [] } },
    });

    await getBuyerPrices(
      config,
      [
        { recordId: "p1", variantKey: null },
        { recordId: "p2", variantKey: "" },
      ],
      { workspaceId: "w1", accessToken: "tok", fetch },
    );

    expect(calls[0]?.variables.items).toEqual([
      { recordId: "p1" },
      { recordId: "p2" },
    ]);
  });

  it("sends nothing for an empty list", async () => {
    const { fetch, calls } = capturingFetch({});

    const prices = await getBuyerPrices(config, [], {
      workspaceId: "w1",
      accessToken: "tok",
      fetch,
    });

    expect(prices).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("refuses more items than one request carries, before the network", async () => {
    const { fetch, calls } = capturingFetch({});
    const items = Array.from(
      { length: CMSSY_BUYER_PRICES_MAX_ITEMS + 1 },
      (_, i) => ({ recordId: `p${i}` }),
    );

    await expect(
      getBuyerPrices(config, items, {
        workspaceId: "w1",
        accessToken: "tok",
        fetch,
      }),
    ).rejects.toThrow(/at most 100 items, got 101/);
    expect(calls).toHaveLength(0);
  });

  it("accepts exactly the limit", async () => {
    const { fetch, calls } = capturingFetch({
      data: { account: { prices: [] } },
    });
    const items = Array.from(
      { length: CMSSY_BUYER_PRICES_MAX_ITEMS },
      (_, i) => ({
        recordId: `p${i}`,
      }),
    );

    await getBuyerPrices(config, items, {
      workspaceId: "w1",
      accessToken: "tok",
      fetch,
    });

    expect(calls).toHaveLength(1);
  });

  it("refuses an anonymous call instead of sending a request with no member", async () => {
    const { fetch, calls } = capturingFetch({});

    await expect(
      getBuyerPrices(config, [{ recordId: "p1" }], {
        workspaceId: "w1",
        accessToken: "",
        fetch,
      }),
    ).rejects.toThrow(/accessToken/);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a refused session as a GraphQL error", async () => {
    const { fetch } = capturingFetch({
      errors: [
        { message: "Not signed in", extensions: { code: "UNAUTHENTICATED" } },
      ],
    });

    const error = await getBuyerPrices(config, [{ recordId: "p1" }], {
      workspaceId: "w1",
      accessToken: "stale",
      fetch,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CmssyGraphqlError);
    expect((error as CmssyGraphqlError).code).toBe("UNAUTHENTICATED");
  });
});

async function checkoutFailure(
  extensions: Record<string, unknown>,
): Promise<unknown> {
  const { fetch } = capturingFetch({
    errors: [{ message: "checkout refused", extensions }],
  });
  return graphqlRequest(
    config,
    "mutation Checkout { cart { checkout { id } } }",
    {},
    { public: true, fetch },
  ).catch((e: unknown) => e);
}

describe("checkoutErrorReason", () => {
  it.each(checkoutErrorReasonValues)(
    "names %s from the error's extensions",
    async (reason) => {
      const error = await checkoutFailure({ code: "CONFLICT", reason });

      expect(checkoutErrorReason(error)).toBe(reason);
      expect((error as CmssyGraphqlError).reason).toBe(reason);
    },
  );

  it("keeps the rest of the extensions readable, like the stale line's itemId", async () => {
    const error = (await checkoutFailure({
      code: "CONFLICT",
      reason: "CART_CURRENCY_CHANGED",
      itemId: "line-1",
    })) as CmssyGraphqlError;

    expect(error.errors[0]?.extensions?.itemId).toBe("line-1");
  });

  it("returns undefined for a reason that is not a checkout reason", async () => {
    const error = await checkoutFailure({
      code: "FORBIDDEN",
      reason: "COMPANY_PERMISSION_REQUIRED",
    });

    expect(checkoutErrorReason(error)).toBeUndefined();
  });

  it("returns undefined for an error without a reason, and for non-GraphQL errors", async () => {
    expect(
      checkoutErrorReason(await checkoutFailure({ code: "BAD_USER_INPUT" })),
    ).toBeUndefined();
    expect(
      checkoutErrorReason(new CmssyRequestError("down", 503)),
    ).toBeUndefined();
    expect(checkoutErrorReason(new Error("CART_REPRICED"))).toBeUndefined();
    expect(checkoutErrorReason(undefined)).toBeUndefined();
    expect(
      checkoutErrorReason({
        errors: [{ extensions: { reason: "CART_REPRICED" } }],
      }),
    ).toBeUndefined();
  });
});
