// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";

import {
  CmssyCommerceProvider,
  useCart,
  type CmssyCommerceState,
} from "../commerce/commerce-provider";
import {
  loadCartSessionToken,
  mintCartSessionToken,
  CART_SESSION_HEADER,
  CART_SESSION_STORAGE_KEY,
} from "../commerce/cart-session";
import { formatPrice } from "../commerce/money";
import type { FetchLike } from "../content/content-client";

interface Call {
  headers: Record<string, string>;
  query: string;
  variables: Record<string, unknown>;
}

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

const CART_WITH_ITEM = {
  ...EMPTY_CART,
  itemCount: 1,
  subtotal: 1999,
  currency: "USD",
  discountedTotal: 1999,
  items: [
    {
      id: "i1",
      recordId: "r1",
      quantity: 1,
      variantSelections: null,
      currentPrice: 1999,
      priceMismatch: false,
      snapshot: {
        name: "Widget",
        price: 1999,
        currency: "USD",
        imageUrl: null,
        sku: "W-1",
      },
    },
  ],
};

const ORDER = {
  id: "o1",
  status: "pending",
  subtotal: 1999,
  total: 1999,
  currency: "USD",
  customerEmail: "buyer@example.com",
};

function makeFetch(): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (_url, init) => {
    const parsed = JSON.parse(init.body) as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push({ headers: init.headers, ...parsed });
    const q = parsed.query;
    let data: Record<string, unknown> = {};
    if (q.includes("publicSiteConfig")) {
      data = {
        publicSiteConfig: {
          id: "s",
          workspaceId: "ws1",
          siteName: null,
          defaultLanguage: null,
          enabledLanguages: [],
          enabledFeatures: [],
          notFoundPageId: null,
          previewUrl: null,
          branding: null,
        },
      };
    } else if (q.includes("addToCart")) {
      data = { addToCart: CART_WITH_ITEM };
    } else if (q.includes("checkout")) {
      data = { checkout: ORDER };
    } else if (q.includes("publicModelRecords")) {
      data = {
        publicModelRecords: {
          items: [{ id: "r1", data: { name: "Widget" }, variants: [] }],
        },
      };
    } else if (q.includes("cart(")) {
      data = { cart: EMPTY_CART };
    }
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  return { fetch, calls };
}

let captured: { current: CmssyCommerceState | null };

function Probe() {
  captured.current = useCart();
  return <div data-testid="count">{captured.current.cart?.itemCount ?? 0}</div>;
}

function mount(fetch: FetchLike) {
  captured = { current: null };
  render(
    <CmssyCommerceProvider
      apiUrl="https://api.test/graphql"
      workspaceSlug="ws"
      fetch={fetch}
    >
      <Probe />
    </CmssyCommerceProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("cart-session", () => {
  it("mints a base64url token of valid shape", () => {
    const token = mintCartSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,128}$/);
  });

  it("persists the token across loads", () => {
    const first = loadCartSessionToken();
    const second = loadCartSessionToken();
    expect(first).toBe(second);
    expect(window.localStorage.getItem(CART_SESSION_STORAGE_KEY)).toBe(first);
  });
});

describe("money", () => {
  it("formats minor units per currency", () => {
    const usd = formatPrice(1999, "USD");
    expect(usd).toContain("19");
    expect(usd).toContain("99");
    const jpy = formatPrice(500, "JPY");
    expect(jpy).toContain("500");
    expect(jpy).not.toMatch(/5[.,]00/);
  });
});

describe("CmssyCommerceProvider / useCart", () => {
  it("resolves the workspace and loads the cart on mount", async () => {
    const { fetch, calls } = makeFetch();
    mount(fetch);
    await waitFor(() => expect(captured.current?.loading).toBe(false));
    expect(calls.some((c) => c.query.includes("publicSiteConfig"))).toBe(true);
    expect(calls.some((c) => c.query.includes("cart("))).toBe(true);
  });

  it("addToCart sends the cart-session header + workspaceId and updates the cart", async () => {
    const { fetch, calls } = makeFetch();
    mount(fetch);
    await waitFor(() => expect(captured.current?.loading).toBe(false));

    await act(async () => {
      await captured.current!.addToCart("r1", 1);
    });

    expect(captured.current!.cart?.itemCount).toBe(1);
    expect(screen.getByTestId("count").textContent).toBe("1");
    const addCall = calls.find((c) => c.query.includes("addToCart"))!;
    expect(addCall.headers[CART_SESSION_HEADER]).toMatch(
      /^[A-Za-z0-9_-]{40,}$/,
    );
    const input = addCall.variables.input as Record<string, unknown>;
    expect(input.workspaceId).toBe("ws1");
    expect(input.recordId).toBe("r1");
  });

  it("checkout returns the order and clears the cart", async () => {
    const { fetch } = makeFetch();
    mount(fetch);
    await waitFor(() => expect(captured.current?.loading).toBe(false));
    await act(async () => {
      await captured.current!.addToCart("r1", 1);
    });

    let order;
    await act(async () => {
      order = await captured.current!.checkout("buyer@example.com");
    });
    expect(order).toMatchObject({ id: "o1", status: "pending" });
    expect(captured.current!.cart).toBeNull();
  });

  it("throws when useCart is used outside the provider", () => {
    function Bare() {
      useCart();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/CmssyCommerceProvider/);
  });
});
