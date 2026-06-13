"use client";

import { useCallback, useEffect, useState } from "react";

import type { CmssyOrder } from "./commerce-queries";

export interface CmssyOrdersState {
  orders: CmssyOrder[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export interface UseCmssyOrdersOptions {
  basePath?: string;
  skip?: number;
  limit?: number;
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
