import { readFileSync } from "node:fs";
import { buildSchema, isEnumType } from "graphql";
import { describe, expect, it } from "vitest";
import type { FetchLike } from "../content/content-client";
import {
  CMSSY_PUBLIC_PRICES_MAX_ITEMS,
  getPublicCatalogPrices,
  getPublicPrices,
  priceWithheldReasonValues,
  type CmssyPublicCatalogPage,
  type CmssyPublicPriceResult,
} from "../data/public-prices";

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

const RESULT: CmssyPublicPriceResult = {
  currency: "EUR",
  displayMode: "gross",
  priceWithheld: null,
  nextChangeAt: "2026-11-01T00:00:00.000Z",
  items: [
    {
      record: {
        id: "p1",
        modelId: "m1",
        data: { name: "Espresso beans" },
        status: "published",
        available: 12,
        quantityIncrement: 1,
        variantCount: 0,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      price: {
        recordId: "p1",
        variantKey: null,
        currency: "EUR",
        price: 900,
        priceMax: null,
        listed: true,
        basePrice: 1000,
        source: "price_list_entry",
        listSource: "CHANNEL",
        minQuantity: 1,
        maxQuantity: 99,
        increment: 1,
        tiers: [],
        displayMode: "gross",
        taxRate: 23,
        taxTreatmentKind: "standard",
        priceAmount: { net: 732, tax: 168, gross: 900 },
        priceMaxAmount: null,
        basePriceAmount: { net: 813, tax: 187, gross: 1000 },
      },
    },
  ],
};

describe("getPublicPrices", () => {
  it("asks public.pricing on the org-scoped route with the config's channel and no member token", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { pricing: { prices: RESULT } } },
    });

    const result = await getPublicPrices(
      { ...config, channel: "horeca" },
      [{ recordId: "p1" }, { recordId: "p2", variantKey: "v1" }],
      { workspaceId: "w1", locale: "pl", fetch },
    );

    expect(result).toEqual(RESULT);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.test/public/acme/ws/graphql");
    expect(calls[0]?.headers["x-workspace-id"]).toBe("w1");
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.query).toContain("query PublicPrices");
    expect(calls[0]?.query).toMatch(
      /currency\s+displayMode\s+priceWithheld\s+nextChangeAt/,
    );
    expect(calls[0]?.query).toMatch(/source\s+listSource/);
    expect(calls[0]?.query).toMatch(/taxRate\s+taxTreatmentKind\s+priceAmount/);
    expect(calls[0]?.variables).toEqual({
      workspaceId: "w1",
      channel: "horeca",
      items: [{ recordId: "p1" }, { recordId: "p2", variantKey: "v1" }],
      locale: "pl",
    });
  });

  it("returns a withheld result as served: no prices and the reason", async () => {
    const withheld: CmssyPublicPriceResult = {
      ...RESULT,
      priceWithheld: "MEMBERS_ONLY",
      items: RESULT.items.map((item) => ({ ...item, price: null })),
    };
    const { fetch } = capturingFetch({
      data: { public: { pricing: { prices: withheld } } },
    });

    const result = await getPublicPrices(config, [{ recordId: "p1" }], {
      workspaceId: "w1",
      channel: "horeca",
      fetch,
    });

    expect(result.priceWithheld).toBe("MEMBERS_ONLY");
    expect(result.items[0]?.price).toBeNull();
  });

  it("returns the currency the channel prices in", async () => {
    const { fetch } = capturingFetch({
      data: { public: { pricing: { prices: RESULT } } },
    });

    const result = await getPublicPrices(
      { ...config, channel: "eu-export" },
      [{ recordId: "p1" }],
      { workspaceId: "w1", fetch },
    );

    expect(result.currency).toBe("EUR");
  });

  it("prices on the call's channel over the config's", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { pricing: { prices: RESULT } } },
    });

    await getPublicPrices(
      { ...config, channel: "horeca" },
      [{ recordId: "p1" }],
      { workspaceId: "w1", channel: "retail", fetch },
    );

    expect(calls[0]?.variables.channel).toBe("retail");
  });

  it("refuses without a channel, before the network", async () => {
    const { fetch, calls } = capturingFetch({});

    await expect(
      getPublicPrices(config, [{ recordId: "p1" }], {
        workspaceId: "w1",
        fetch,
      }),
    ).rejects.toThrow(/sales channel/);
    expect(calls).toHaveLength(0);
  });

  it(`refuses more than ${CMSSY_PUBLIC_PRICES_MAX_ITEMS} items, before the network`, async () => {
    const { fetch, calls } = capturingFetch({});
    const items = Array.from(
      { length: CMSSY_PUBLIC_PRICES_MAX_ITEMS + 1 },
      (_, i) => ({ recordId: `p${i}` }),
    );

    await expect(
      getPublicPrices(config, items, {
        workspaceId: "w1",
        channel: "horeca",
        fetch,
      }),
    ).rejects.toThrow(/at most 50 items, got 51/);
    expect(calls).toHaveLength(0);
  });
});

describe("getPublicCatalogPrices", () => {
  const PAGE: CmssyPublicCatalogPage = {
    ...RESULT,
    total: 1,
    hasMore: false,
  };

  it("lists on the config's channel with the listing's arguments", async () => {
    const { fetch, calls } = capturingFetch({
      data: { public: { pricing: { catalogPrices: PAGE } } },
    });

    const page = await getPublicCatalogPrices(
      { ...config, channel: "horeca" },
      { modelSlug: "products", sort: "PRICE_DESC", limit: 10 },
      { workspaceId: "w1", fetch },
    );

    expect(page).toEqual(PAGE);
    expect(calls[0]?.url).toBe("https://api.test/public/acme/ws/graphql");
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.query).toContain("query PublicCatalogPrices");
    expect(calls[0]?.query).toMatch(
      /total\s+hasMore\s+currency\s+displayMode\s+priceWithheld\s+nextChangeAt/,
    );
    expect(calls[0]?.query).toMatch(/taxRate\s+taxTreatmentKind\s+priceAmount/);
    expect(calls[0]?.variables).toEqual({
      workspaceId: "w1",
      channel: "horeca",
      modelSlug: "products",
      sort: "PRICE_DESC",
      limit: 10,
    });
  });


  it("refuses without a channel, before the network", async () => {
    const { fetch, calls } = capturingFetch({});

    await expect(
      getPublicCatalogPrices(
        { ...config, channel: "  " },
        { modelSlug: "products" },
        { workspaceId: "w1", fetch },
      ),
    ).rejects.toThrow(/sales channel/);
    expect(calls).toHaveLength(0);
  });
});

describe("priceWithheldReasonValues", () => {
  it("lists exactly the PriceWithheldReason values the API serves", () => {
    const schema = buildSchema(
      readFileSync(
        new URL("../../../../schema.graphql", import.meta.url),
        "utf8",
      ),
    );
    const reason = schema.getType("PriceWithheldReason");

    expect(isEnumType(reason)).toBe(true);
    expect(
      isEnumType(reason)
        ? reason
            .getValues()
            .map((v) => v.name)
            .sort()
        : [],
    ).toEqual([...priceWithheldReasonValues].sort());
  });
});
