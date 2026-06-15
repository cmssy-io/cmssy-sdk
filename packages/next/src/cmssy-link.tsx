"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { localizeHref, type CmssyLocaleContext } from "@cmssy/react";
import { useCmssyLocale } from "@cmssy/react/client";

export interface CmssyLinkProps extends Omit<
  ComponentProps<typeof Link>,
  "href" | "locale"
> {
  href: string;
  /** Override the active locale (defaults to the nearest CmssyLocaleProvider). */
  locale?: CmssyLocaleContext;
}

/**
 * `next/link` that prefixes internal hrefs with the active locale, so navigation
 * preserves the language. Reads the locale from the nearest
 * `CmssyLocaleProvider`; falls back to the raw href when none is mounted.
 */
export function CmssyLink({ href, locale, ...rest }: CmssyLinkProps) {
  const fromContext = useCmssyLocale();
  const active = locale ?? fromContext;
  const resolved = active ? localizeHref(href, active) : href;
  return <Link href={resolved} {...rest} />;
}
