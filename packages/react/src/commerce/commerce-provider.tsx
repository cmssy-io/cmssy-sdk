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

import type { CmssyCart, CmssyOrder, CmssyProduct } from "./commerce-queries";

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
  basePath?: string;
}

export function CmssyCommerceProvider({
  children,
  basePath = "/api/cmssy/cart",
}: CmssyCommerceProviderProps) {
  const base = useMemo(() => basePath.replace(/\/+$/, ""), [basePath]);
  const generation = useRef(0);
  const [cart, setCart] = useState<CmssyCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const post = useCallback(
    async <T,>(action: string, body: Record<string, unknown>): Promise<T> => {
      const res = await fetch(`${base}/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "Commerce request failed",
        );
      }
      return data as T;
    },
    [base],
  );

  const runCart = useCallback(
    async (action: string, body: Record<string, unknown>): Promise<void> => {
      const gen = ++generation.current;
      setError(null);
      try {
        const data = await post<{ cart: CmssyCart | null }>(action, body);
        if (gen === generation.current) setCart(data.cart);
      } catch (err) {
        if (gen === generation.current) {
          setError(
            err instanceof Error ? err.message : "Commerce request failed",
          );
        }
        throw err;
      }
    },
    [post],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await runCart("cart", {});
    } catch {
      return;
    } finally {
      setLoading(false);
    }
  }, [runCart]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addToCart = useCallback(
    (recordId: string, quantity = 1, options?: CmssyAddToCartOptions) =>
      runCart("add", {
        recordId,
        quantity,
        variantSelections: options?.variantSelections,
        notes: options?.notes,
      }),
    [runCart],
  );

  const updateItem = useCallback(
    (itemId: string, quantity: number) =>
      runCart("update", { itemId, quantity }),
    [runCart],
  );

  const removeItem = useCallback(
    (itemId: string) => runCart("remove", { itemId }),
    [runCart],
  );

  const clearCart = useCallback(() => runCart("clear", {}), [runCart]);

  const applyDiscount = useCallback(
    (code: string) => runCart("apply-discount", { code }),
    [runCart],
  );

  const removeDiscount = useCallback(
    () => runCart("remove-discount", {}),
    [runCart],
  );

  const checkout = useCallback(
    async (customerEmail: string): Promise<CmssyOrder> => {
      const gen = ++generation.current;
      setError(null);
      try {
        const data = await post<{ order: CmssyOrder }>("checkout", {
          customerEmail,
        });
        if (gen === generation.current) setCart(null);
        return data.order;
      } catch (err) {
        if (gen === generation.current) {
          setError(err instanceof Error ? err.message : "Checkout failed");
        }
        throw err;
      }
    },
    [post],
  );

  const fetchProduct = useCallback(
    async (
      modelSlug: string,
      filter: Record<string, unknown>,
    ): Promise<CmssyProduct | null> => {
      const data = await post<{ product: CmssyProduct | null }>("product", {
        modelSlug,
        filter,
      });
      return data.product;
    },
    [post],
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
