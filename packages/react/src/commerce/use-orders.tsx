"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  CmssyOrder,
  UseCmssyOrdersOptions,
  UseCmssyOrderOptions,
} from "@cmssy/types";

// Hook option shapes live in @cmssy/types; re-exported for consumers.
export type { UseCmssyOrdersOptions, UseCmssyOrderOptions };

export interface CmssyOrdersState {
  orders: CmssyOrder[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export function useCmssyOrders(
  options: UseCmssyOrdersOptions = {},
): CmssyOrdersState {
  const base = (options.basePath ?? "/api/cmssy/orders").replace(/\/+$/, "");
  const skip = options.skip ?? 0;
  const limit = options.limit ?? 20;

  const [orders, setOrders] = useState<CmssyOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
      });
      const res = await fetch(`${base}?${qs.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401) {
        setOrders([]);
        setTotal(0);
        setHasMore(false);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(
          body.message ?? `Orders request failed (${res.status})`,
        );
      }
      const data = (await res.json()) as {
        items?: CmssyOrder[];
        total?: number;
        hasMore?: boolean;
      };
      setOrders(data.items ?? []);
      setTotal(data.total ?? 0);
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [base, skip, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { orders, total, hasMore, loading, error, refresh: load };
}

export interface CmssyOrderState {
  order: CmssyOrder | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export function useCmssyOrder(
  id: string | null | undefined,
  options: UseCmssyOrderOptions = {},
): CmssyOrderState {
  const base = (options.basePath ?? "/api/cmssy/orders").replace(/\/+$/, "");

  const [order, setOrder] = useState<CmssyOrder | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setOrder(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ id });
      const res = await fetch(`${base}?${qs.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401) {
        setOrder(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `Order request failed (${res.status})`);
      }
      const data = (await res.json()) as { order?: CmssyOrder | null };
      setOrder(data.order ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the order");
    } finally {
      setLoading(false);
    }
  }, [base, id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { order, loading, error, refresh: load };
}
