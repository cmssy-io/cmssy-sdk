import * as React from "react";

export type PerRequest = <T>(factory: () => T) => () => T;

export function resolvePerRequest(cache: unknown): PerRequest {
  if (typeof cache === "function") return cache as PerRequest;
  return (factory) => factory;
}

export const perRequest = resolvePerRequest(
  (React as { cache?: unknown }).cache,
);
