"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CmssyLocaleContext } from "@cmssy/core";

const LocaleContext = createContext<CmssyLocaleContext | null>(null);

export interface CmssyLocaleProviderProps {
  value: CmssyLocaleContext;
  children: ReactNode;
}

export function CmssyLocaleProvider({
  value,
  children,
}: CmssyLocaleProviderProps) {
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useCmssyLocale(): CmssyLocaleContext | null {
  return useContext(LocaleContext);
}
