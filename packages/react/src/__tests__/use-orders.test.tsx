// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";

import { useCmssyOrders } from "../commerce/use-orders";

const ORDER = {
  id: "o1",
  status: "pending",
  subtotal: 1000,
  total: 1000,
  currency: "PLN",
  customerEmail: "u@x.com",
  items: [
    { name: "Widget", price: 1000, currency: "PLN", quantity: 1, sku: null },
  ],
};

let calls: string[] = [];

function mock(status: number, payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect(init?.credentials).toBe("same-origin");
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useCmssyOrders", () => {
  it("loads the member's orders from the same-origin BFF", async () => {
    mock(200, { items: [ORDER], total: 1, hasMore: false });
    const { result } = renderHook(() => useCmssyOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orders).toEqual([ORDER]);
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
    expect(calls[0]).toContain("/api/cmssy/orders");
  });

  it("treats 401 (not signed in) as an empty list, not an error", async () => {
    mock(401, { message: "Not signed in." });
    const { result } = renderHook(() => useCmssyOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orders).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a server error via error state", async () => {
    mock(502, { message: "Orders error" });
    const { result } = renderHook(() => useCmssyOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("Orders error");
  });
});
