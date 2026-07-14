"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CmssyLocaleContext } from "@cmssy/core";

const LocaleContext = createContext<CmssyLocaleContext | null>(null);

export interface CmssyLocaleProviderProps {
  value: CmssyLocaleContext;
  children: ReactNode;
}

/**
 * Exposes the active locale ({@link CmssyLocaleContext}) to client components
 * below it (e.g. `CmssyLink`) so they can build locale-aware hrefs without
 * prop-drilling. Wrap your root layout body with it.
 */
export function CmssyLocaleProvider({
  value,
  children,
}: CmssyLocaleProviderProps) {
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/** Reads the active locale; returns null when no provider is mounted. */
export function useCmssyLocale(): CmssyLocaleContext | null {
  return useContext(LocaleContext);
}
