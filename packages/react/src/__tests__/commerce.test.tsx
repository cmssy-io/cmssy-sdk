// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";

import {
  CmssyCommerceProvider,
  useCart,
  type CmssyCommerceState,
} from "../commerce/commerce-provider";
import { formatPrice, toMinorUnits } from "../commerce/money";
import { productBlock } from "../commerce/product-block";

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

interface Call {
  url: string;
  body: Record<string, unknown>;
  credentials?: string;
}

let calls: Call[] = [];

function mockBff(
  responder: (
    action: string,
    body: Record<string, unknown>,
  ) => {
    status?: number;
    payload: unknown;
  },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body, credentials: init?.credentials });
      const action = url.split("/").pop() ?? "";
      const { status = 200, payload } = responder(action, body);
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

let captured: { current: CmssyCommerceState | null };

function Probe() {
  captured.current = useCart();
  return <div data-testid="count">{captured.current.cart?.itemCount ?? 0}</div>;
}

function mount() {
  captured = { current: null };
  render(
    <CmssyCommerceProvider>
      <Probe />
    </CmssyCommerceProvider>,
  );
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("money", () => {
  it("formats minor units per currency", () => {
    const usd = formatPrice(1999, "USD");
    expect(usd).toContain("19");
    expect(usd).toContain("99");
    const jpy = formatPrice(500, "JPY");
    expect(jpy).toContain("500");
    expect(jpy).not.toMatch(/5[.,]00/);
    expect(formatPrice(NaN, "USD")).toBe("");
    expect(formatPrice(Infinity, "USD")).toBe("");
  });

  it("converts major units to minor per currency", () => {
    expect(toMinorUnits(12999, "PLN")).toBe(1299900);
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(500, "JPY")).toBe(500);
  });
});

describe("CmssyCommerceProvider / useCart", () => {
  it("loads the cart from the same-origin BFF on mount", async () => {
    mockBff(() => ({ payload: { cart: EMPTY_CART } }));
    mount();
    await waitFor(() => expect(captured.current?.loading).toBe(false));
    const cartCall = calls.find((c) => c.url.endsWith("/api/cmssy/cart/cart"));
    expect(cartCall).toBeDefined();
    expect(cartCall!.credentials).toBe("same-origin");
  });

  it("addToCart posts to the BFF and updates the cart", async () => {
    mockBff((action) =>
      action === "add"
        ? { payload: { cart: CART_WITH_ITEM } }
        : { payload: { cart: EMPTY_CART } },
    );
    mount();
    await waitFor(() => expect(captured.current?.loading).toBe(false));

    await act(async () => {
      await captured.current!.addToCart("r1", 2, {
        variantSelections: { size: "M" },
      });
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
    const addCall = calls.find((c) => c.url.endsWith("/api/cmssy/cart/add"))!;
    expect(addCall.body.recordId).toBe("r1");
    expect(addCall.body.quantity).toBe(2);
    expect(addCall.body.variantSelections).toEqual({ size: "M" });
    expect(addCall.url).not.toContain("graphql");
  });

  it("checkout posts to the BFF, returns the order and clears the cart", async () => {
    mockBff((action) => {
      if (action === "checkout") return { payload: { order: ORDER } };
      if (action === "add") return { payload: { cart: CART_WITH_ITEM } };
      return { payload: { cart: EMPTY_CART } };
    });
    mount();
    await waitFor(() => expect(captured.current?.loading).toBe(false));
    await act(async () => {
      await captured.current!.addToCart("r1", 1);
    });

    let order;
    await act(async () => {
      order = await captured.current!.checkout({
        customerEmail: "buyer@example.com",
      });
    });
    expect(order).toMatchObject({ id: "o1", status: "pending" });
    expect(captured.current!.cart).toBeNull();
  });

  it("surfaces a failed cart op via error state", async () => {
    mockBff((action) =>
      action === "add"
        ? { status: 502, payload: { message: "Out of stock" } }
        : { payload: { cart: EMPTY_CART } },
    );
    mount();
    await waitFor(() => expect(captured.current?.loading).toBe(false));
    let threw = false;
    await act(async () => {
      try {
        await captured.current!.addToCart("r1", 1);
      } catch {
        threw = true;
      }
    });
    expect(threw).toBe(true);
    expect(captured.current!.error).toContain("Out of stock");
  });

  it("throws when useCart is used outside the provider", () => {
    function Bare() {
      useCart();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/CmssyCommerceProvider/);
  });
});

describe("productBlock", () => {
  const Product = productBlock.component;

  it("renders a raw major-unit price scaled to the currency", async () => {
    mockBff((action) =>
      action === "product"
        ? {
            payload: {
              product: {
                id: "p1",
                data: { name: "MacBook Pro 16", price: 12999, currency: "PLN" },
                variants: [],
              },
            },
          }
        : { payload: { cart: EMPTY_CART } },
    );

    render(
      <CmssyCommerceProvider>
        <Product content={{ modelSlug: "product", slug: "macbook-pro-16" }} />
      </CmssyCommerceProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("MacBook Pro 16")).toBeDefined(),
    );

    const price = document.querySelector("[data-cmssy-product-price]");
    expect(price?.textContent).toContain("999");
    expect(price?.textContent).not.toMatch(/129[.,]99/);
  });

  it("renders an injected (server-fetched) product without a BFF product call", async () => {
    mockBff(() => ({ payload: { cart: EMPTY_CART } }));

    render(
      <CmssyCommerceProvider>
        <Product
          content={{
            modelSlug: "product",
            slug: "macbook-pro-16",
            product: {
              id: "p1",
              data: { name: "MacBook Pro 16", price: 12999, currency: "PLN" },
              variants: [],
            },
          }}
        />
      </CmssyCommerceProvider>,
    );

    expect(screen.getByText("MacBook Pro 16")).toBeDefined();
    expect(calls.some((c) => c.url.endsWith("/api/cmssy/cart/product"))).toBe(
      false,
    );
  });
});
