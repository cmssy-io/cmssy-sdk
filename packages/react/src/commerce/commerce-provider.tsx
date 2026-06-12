"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createCmssyClient, type CmssyClient } from "../data/client";
import type { FetchLike } from "../content/content-client";
import type { GraphqlRequestOptions } from "../data/graphql-request";
import {
  cartSessionHeaders,
  clearCartSessionToken,
  loadCartSessionToken,
} from "./cart-session";
import {
  ADD_TO_CART_MUTATION,
  APPLY_DISCOUNT_MUTATION,
  CART_QUERY,
  CHECKOUT_MUTATION,
  CLEAR_CART_MUTATION,
  PRODUCT_QUERY,
  REMOVE_CART_ITEM_MUTATION,
  REMOVE_DISCOUNT_MUTATION,
  UPDATE_CART_ITEM_MUTATION,
  type CmssyCart,
  type CmssyOrder,
  type CmssyProduct,
} from "./commerce-queries";

export interface CmssyAddToCartOptions {
  variantSelections?: Record<string, string>;
  notes?: string;
}

export interface CmssyCommerceState {
  cart: CmssyCart | null;
  loading: boolean;
  error: string | null;
  addToCart(
    recordId: string,
    quantity?: number,
    options?: CmssyAddToCartOptions,
  ): Promise<void>;
  updateItem(itemId: string, quantity: number): Promise<void>;
  removeItem(itemId: string): Promise<void>;
  clearCart(): Promise<void>;
  applyDiscount(code: string): Promise<void>;
  removeDiscount(): Promise<void>;
  checkout(customerEmail: string): Promise<CmssyOrder>;
  refresh(): Promise<void>;
  fetchProduct(
    modelSlug: string,
    filter: Record<string, unknown>,
  ): Promise<CmssyProduct | null>;
}

const CmssyCommerceContext = createContext<CmssyCommerceState | null>(null);

export interface CmssyCommerceProviderProps {
  children: ReactNode;
  apiUrl: string;
  workspaceSlug: string;
  fetch?: FetchLike;
}

export function CmssyCommerceProvider({
  children,
  apiUrl,
  workspaceSlug,
  fetch: customFetch,
}: CmssyCommerceProviderProps) {
  const client = useMemo<CmssyClient>(
    () => createCmssyClient({ apiUrl, workspaceSlug }),
    [apiUrl, workspaceSlug],
  );
  const tokenRef = useRef<string | null>(null);
  const workspaceIdRef = useRef<string | null>(null);
  const fetchRef = useRef<FetchLike | undefined>(customFetch);
  fetchRef.current = customFetch;
  const generation = useRef(0);
  const [cart, setCart] = useState<CmssyCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ensureContext = useCallback(async (): Promise<{
    workspaceId: string;
    options: GraphqlRequestOptions;
  }> => {
    const fetch = fetchRef.current;
    if (tokenRef.current === null) {
      tokenRef.current = loadCartSessionToken();
    }
    if (workspaceIdRef.current === null) {
      workspaceIdRef.current = await client.resolveWorkspaceId(
        fetch ? { fetch } : undefined,
      );
    }
    return {
      workspaceId: workspaceIdRef.current,
      options: {
        headers: cartSessionHeaders(tokenRef.current),
        ...(fetch ? { fetch } : {}),
      },
    };
  }, [client]);

  const run = useCallback(
    async (
      operation: (ctx: {
        workspaceId: string;
        options: GraphqlRequestOptions;
      }) => Promise<CmssyCart | null>,
    ): Promise<void> => {
      const gen = ++generation.current;
      setError(null);
      try {
        const ctx = await ensureContext();
        const result = await operation(ctx);
        if (gen === generation.current) setCart(result);
      } catch (err) {
        if (gen === generation.current) {
          setError(
            err instanceof Error ? err.message : "Commerce request failed",
          );
        }
        throw err;
      }
    },
    [ensureContext],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await run(async ({ workspaceId, options }) => {
        const data = await client.query<{ cart: CmssyCart | null }>(
          CART_QUERY,
          { workspaceId },
          options,
        );
        return data.cart;
      });
    } catch {
      return;
    } finally {
      setLoading(false);
    }
  }, [client, run]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addToCart = useCallback(
    (recordId: string, quantity = 1, options?: CmssyAddToCartOptions) =>
      run(async ({ workspaceId, options: reqOptions }) => {
        const data = await client.query<{ addToCart: CmssyCart }>(
          ADD_TO_CART_MUTATION,
          {
            input: {
              workspaceId,
              recordId,
              quantity,
              variantSelections: options?.variantSelections,
              notes: options?.notes,
            },
          },
          reqOptions,
        );
        return data.addToCart;
      }),
    [client, run],
  );

  const updateItem = useCallback(
    (itemId: string, quantity: number) =>
      run(async ({ workspaceId, options }) => {
        const data = await client.query<{ updateCartItem: CmssyCart }>(
          UPDATE_CART_ITEM_MUTATION,
          { input: { workspaceId, itemId, quantity } },
          options,
        );
        return data.updateCartItem;
      }),
    [client, run],
  );

  const removeItem = useCallback(
    (itemId: string) =>
      run(async ({ workspaceId, options }) => {
        const data = await client.query<{ removeCartItem: CmssyCart }>(
          REMOVE_CART_ITEM_MUTATION,
          { workspaceId, itemId },
          options,
        );
        return data.removeCartItem;
      }),
    [client, run],
  );

  const clearCart = useCallback(
    () =>
      run(async ({ workspaceId, options }) => {
        const data = await client.query<{ clearCart: CmssyCart }>(
          CLEAR_CART_MUTATION,
          { workspaceId },
          options,
        );
        return data.clearCart;
      }),
    [client, run],
  );

  const applyDiscount = useCallback(
    (code: string) =>
      run(async ({ workspaceId, options }) => {
        const data = await client.query<{ applyDiscount: CmssyCart }>(
          APPLY_DISCOUNT_MUTATION,
          { workspaceId, code },
          options,
        );
        return data.applyDiscount;
      }),
    [client, run],
  );

  const removeDiscount = useCallback(
    () =>
      run(async ({ workspaceId, options }) => {
        const data = await client.query<{ removeDiscount: CmssyCart }>(
          REMOVE_DISCOUNT_MUTATION,
          { workspaceId },
          options,
        );
        return data.removeDiscount;
      }),
    [client, run],
  );

  const checkout = useCallback(
    async (customerEmail: string): Promise<CmssyOrder> => {
      const gen = ++generation.current;
      setError(null);
      try {
        const { workspaceId, options } = await ensureContext();
        const data = await client.query<{ checkout: CmssyOrder }>(
          CHECKOUT_MUTATION,
          { input: { workspaceId, customerEmail } },
          options,
        );
        clearCartSessionToken();
        tokenRef.current = loadCartSessionToken();
        if (gen === generation.current) setCart(null);
        return data.checkout;
      } catch (err) {
        if (gen === generation.current) {
          setError(err instanceof Error ? err.message : "Checkout failed");
        }
        throw err;
      }
    },
    [client, ensureContext],
  );

  const fetchProduct = useCallback(
    async (
      modelSlug: string,
      filter: Record<string, unknown>,
    ): Promise<CmssyProduct | null> => {
      const fetch = fetchRef.current;
      const reqOptions = fetch ? { fetch } : undefined;
      const workspaceId = await client.resolveWorkspaceId(reqOptions);
      const data = await client.query<{
        publicModelRecords: { items: CmssyProduct[] };
      }>(PRODUCT_QUERY, { workspaceId, modelSlug, filter }, reqOptions);
      return data.publicModelRecords.items[0] ?? null;
    },
    [client],
  );

  const value = useMemo<CmssyCommerceState>(
    () => ({
      cart,
      loading,
      error,
      addToCart,
      updateItem,
      removeItem,
      clearCart,
      applyDiscount,
      removeDiscount,
      checkout,
      refresh,
      fetchProduct,
    }),
    [
      cart,
      loading,
      error,
      addToCart,
      updateItem,
      removeItem,
      clearCart,
      applyDiscount,
      removeDiscount,
      checkout,
      refresh,
      fetchProduct,
    ],
  );

  return (
    <CmssyCommerceContext.Provider value={value}>
      {children}
    </CmssyCommerceContext.Provider>
  );
}

export function useCart(): CmssyCommerceState {
  const ctx = useContext(CmssyCommerceContext);
  if (!ctx) {
    throw new Error("useCart must be used within <CmssyCommerceProvider>");
  }
  return ctx;
}
