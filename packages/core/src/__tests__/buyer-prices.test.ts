import { readFileSync } from "node:fs";
import { buildSchema, isEnumType } from "graphql";
import { describe, expect, it } from "vitest";
import type { FetchLike } from "../content/content-client";
import {
  CMSSY_BUYER_PRICES_MAX_ITEMS,
  getBuyerCatalogPrices,
  getBuyerPrices,
  priceDisplayModeValues,
  type CmssyBuyerCatalogPage,
  type CmssyBuyerPrice,
} from "../data/buyer-prices";
import {
  checkoutErrorReason,
  checkoutErrorReasonValues,
  quantityRuleReasonValues,
  quantityRuleViolation,
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
  basePrice: 1000,
  source: "price_list_percent",
  minQuantity: 6,
  maxQuantity: 120,
  increment: 6,
  tiers: [],
  displayMode: "net",
  taxRate: 23,
  priceAmount: { net: 900, tax: 207, gross: 1107 },
  priceMaxAmount: { net: 1200, tax: 276, gross: 1476 },
  basePriceAmount: { net: 1000, tax: 230, gross: 1230 },
};

const VARIANT: CmssyBuyerPrice = {
  recordId: "p2",
  variantKey: "v1",
  currency: "EUR",
  price: 500,
  priceMax: null,
  listed: false,
  basePrice: 500,
  source: "catalogue",
  minQuantity: 1,
  maxQuantity: 99,
  increment: 1,
  tiers: [{ minQty: 10, price: 450 }],
  displayMode: "gross",
  taxRate: 0,
  priceAmount: { net: 500, tax: 0, gross: 500 },
  priceMaxAmount: null,
  basePriceAmount: { net: 500, tax: 0, gross: 500 },
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
    expect(calls[0]?.query).toMatch(/minQuantity\s+maxQuantity\s+increment/);
    expect(calls[0]?.query).toMatch(/displayMode\s+taxRate/);
    expect(calls[0]?.query).toMatch(/priceAmount\s*\{\s*net\s+tax\s+gross\s*\}/);
    expect(calls[0]?.query).toMatch(/priceMaxAmount\s*\{\s*net\s+tax\s+gross\s*\}/);
    expect(calls[0]?.query).toMatch(/basePriceAmount\s*\{\s*net\s+tax\s+gross\s*\}/);
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

  it("names BUYER_CHANGED, the cart restamped for another buyer at checkout", async () => {
    const error = await checkoutFailure({
      code: "CONFLICT",
      reason: "BUYER_CHANGED",
    });

    expect(checkoutErrorReason(error)).toBe("BUYER_CHANGED");
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

describe("quantityRuleViolation", () => {
  it.each(quantityRuleReasonValues)(
    "reads %s with the rule the quantity broke",
    async (reason) => {
      const error = await checkoutFailure({
        code: "CONFLICT",
        reason,
        quantity: 7,
        minQuantity: 6,
        maxQuantity: 120,
        increment: 6,
        itemId: "line-1",
      });

      expect(checkoutErrorReason(error)).toBe(reason);
      expect(quantityRuleViolation(error)).toEqual({
        reason,
        quantity: 7,
        minQuantity: 6,
        maxQuantity: 120,
        increment: 6,
        itemId: "line-1",
      });
    },
  );

  it("gives a null itemId when an add or update refused the quantity", async () => {
    const error = await checkoutFailure({
      code: "LIMIT_EXCEEDED",
      reason: "QUANTITY_ABOVE_MAX",
      quantity: 200,
      minQuantity: 1,
      maxQuantity: 120,
      increment: 1,
    });

    expect(quantityRuleViolation(error)?.itemId).toBeNull();
  });

  it("returns undefined for another reason, a missing bound, or a non-GraphQL error", async () => {
    expect(
      quantityRuleViolation(
        await checkoutFailure({ code: "CONFLICT", reason: "CART_REPRICED" }),
      ),
    ).toBeUndefined();
    expect(
      quantityRuleViolation(
        await checkoutFailure({
          code: "BAD_USER_INPUT",
          reason: "QUANTITY_NOT_ON_STEP",
          quantity: 7,
          minQuantity: 1,
          maxQuantity: 99,
        }),
      ),
    ).toBeUndefined();
    expect(quantityRuleViolation(new Error("QUANTITY_BELOW_MIN"))).toBeUndefined();
  });
});

describe("getBuyerCatalogPrices", () => {
  const PAGE: CmssyBuyerCatalogPage = {
    total: 2,
    hasMore: true,
    displayMode: "net",
    items: [
      {
        recordId: "p2",
        currency: "EUR",
        price: 500,
        priceMax: null,
        listed: true,
        basePrice: 3000,
        source: "price_list_entry",
        minQuantity: 12,
        maxQuantity: 96,
        increment: 12,
        displayMode: "net",
        taxRate: 23,
        priceAmount: { net: 500, tax: 115, gross: 615 },
        priceMaxAmount: null,
        basePriceAmount: { net: 3000, tax: 690, gross: 3690 },
      },
    ],
  };

  it("asks the delivery route with the member's token and the listing's arguments", async () => {
    const { fetch, calls } = capturingFetch({
      data: { account: { catalogPrices: PAGE } },
    });

    const page = await getBuyerCatalogPrices(
      config,
      {
        modelSlug: "products",
        filter: { category: "tools" },
        priceMax: 5000,
        sort: "PRICE_ASC",
        limit: 1,
      },
      { workspaceId: "w1", accessToken: "tok", fetch },
    );

    expect(page).toEqual(PAGE);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.test/public/acme/ws/graphql");
    expect(calls[0]?.headers.authorization).toBe("Bearer tok");
    expect(calls[0]?.query).toContain("query BuyerCatalogPrices");
    expect(calls[0]?.query).toMatch(/minQuantity\s+maxQuantity\s+increment/);
    expect(calls[0]?.query).toMatch(/hasMore\s+displayMode\s+items/);
    expect(calls[0]?.query).toMatch(/displayMode\s+taxRate\s+priceAmount/);
    expect(calls[0]?.variables).toEqual({
      workspaceId: "w1",
      modelSlug: "products",
      filter: { category: "tools" },
      priceMax: 5000,
      sort: "PRICE_ASC",
      limit: 1,
    });
  });

  it("refuses without a member token, before the network", async () => {
    const { fetch, calls } = capturingFetch({});

    await expect(
      getBuyerCatalogPrices(
        config,
        { modelSlug: "products" },
        { workspaceId: "w1", accessToken: "", fetch },
      ),
    ).rejects.toThrow(/accessToken/);
    expect(calls).toHaveLength(0);
  });
});

describe("priceDisplayModeValues", () => {
  it("lists exactly the PriceDisplayMode values the API serves", () => {
    const schema = buildSchema(
      readFileSync(new URL("../../../../schema.graphql", import.meta.url), "utf8"),
    );
    const mode = schema.getType("PriceDisplayMode");

    expect(isEnumType(mode)).toBe(true);
    expect(
      isEnumType(mode) ? mode.getValues().map((v) => v.name).sort() : [],
    ).toEqual([...priceDisplayModeValues].sort());
  });
});
