"use client";

// @cmssy/react/internal — client plumbing shared by first-party @cmssy packages
// (used by @cmssy/next's createCmssyPage / CmssyLink to thread the CMS content
// locale into blocks). NOT a stable public API.

export {
  CmssyLocaleProvider,
  useCmssyLocale,
} from "./components/locale-provider";
export type { CmssyLocaleProviderProps } from "./components/locale-provider";
