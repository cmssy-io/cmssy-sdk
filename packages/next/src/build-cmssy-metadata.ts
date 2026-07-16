import type { Metadata } from "next";
import {
  fetchPageMeta,
  fetchSiteConfig,
  normalizeSlug,
  splitLocaleFromPath,
  type CmssyClientConfig,
  type CmssyLocalizedValue,
} from "@cmssy/react";
import type { CmssyConfig } from "@cmssy/core";
import { resolveSeoBaseUrl, type SeoBaseUrlOption } from "./seo-base-url";
import { localesFromSiteConfig, localizedPath } from "@cmssy/core";

export interface BuildCmssyMetadataOptions extends SeoBaseUrlOption {
  /** Override the Open Graph / Twitter image (defaults to workspace branding). */
  image?: string;
  /** Open Graph type. Defaults to "website". */
  ogType?: string;
  /** Twitter card. Defaults to "summary_large_image" when an image exists. */
  twitterCard?: "summary" | "summary_large_image";
  /**
   * The language to render metadata in. Only needed when the language does not
   * live in the URL (a per-domain or cookie strategy); with a locale prefix the
   * path already says it.
   */
  locale?: string;
}

/** Pick a localized string, falling back to the default locale then any value. */
function pick(
  value: CmssyLocalizedValue | undefined,
  locale: string,
  defaultLocale: string,
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] || value[defaultLocale] || Object.values(value)[0] || "";
}

/**
 * Builds complete Next.js `Metadata` for a cmssy page from its SEO fields and
 * the workspace branding: title/description/keywords, canonical + per-locale
 * `hreflang` alternates, and Open Graph / Twitter cards (with the branding OG
 * image). Use in a route's `generateMetadata`:
 *
 *   export const generateMetadata = async ({ params }) =>
 *     buildCmssyMetadata(cmssy, (await params).path);
 *
 * Pass the catch-all segments **as routed**, locale prefix and all: the prefix
 * is what says which language this page is. Stripping it first (and leaving the
 * language to `config.resolveLocale`) is how every localized page ends up with
 * the default language's title - and a canonical pointing at the default
 * language's URL, which tells Google the translation is a duplicate.
 */
export async function buildCmssyMetadata(
  config: CmssyConfig,
  path?: string | string[],
  options: BuildCmssyMetadataOptions = {},
): Promise<Metadata> {
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    org: config.org,
    workspaceSlug: config.workspaceSlug,
  };

  const [siteConfig, baseUrl] = await Promise.all([
    fetchSiteConfig(clientConfig).catch(() => null),
    resolveSeoBaseUrl(config, options.baseUrl),
  ]);

  const { defaultLocale, locales: enabledLocales } =
    localesFromSiteConfig(siteConfig);

  // The prefix in the path is the language, so read it from there - the same
  // rule the router used. An explicit locale wins (per-domain strategies), and
  // resolveLocale is the fallback for a site whose URLs carry no language.
  const segments = Array.isArray(path)
    ? path
    : path
      ? path.split("/").filter(Boolean)
      : undefined;
  const fromPath = splitLocaleFromPath(segments, {
    defaultLocale,
    locales: enabledLocales,
  });
  const locale =
    options.locale ??
    (fromPath.locale !== defaultLocale
      ? fromPath.locale
      : ((await config.resolveLocale?.()) ?? defaultLocale));
  const slug = normalizeSlug(fromPath.path);

  const meta = await fetchPageMeta(clientConfig, slug).catch(() => null);

  const siteName =
    pick(siteConfig?.siteName as CmssyLocalizedValue, locale, defaultLocale) ||
    siteConfig?.branding?.brandName ||
    undefined;

  const title =
    pick(meta?.seoTitle, locale, defaultLocale) ||
    pick(meta?.displayName, locale, defaultLocale) ||
    siteName ||
    "";
  const description = pick(meta?.seoDescription, locale, defaultLocale);
  const keywords = meta?.seoKeywords?.length ? meta.seoKeywords : undefined;
  const image = options.image ?? siteConfig?.branding?.ogImageUrl ?? undefined;

  const canonical = baseUrl
    ? `${baseUrl}${localizedPath(slug, locale, defaultLocale)}`
    : undefined;
  const languages =
    baseUrl && enabledLocales.length > 1
      ? {
          ...Object.fromEntries(
            enabledLocales.map((l) => [
              l,
              `${baseUrl}${localizedPath(slug, l, defaultLocale)}`,
            ]),
          ),
          // What to serve a reader whose language none of these match.
          "x-default": `${baseUrl}${localizedPath(slug, defaultLocale, defaultLocale)}`,
        }
      : undefined;

  return {
    ...(baseUrl ? { metadataBase: new URL(baseUrl) } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(keywords ? { keywords } : {}),
    ...(canonical || languages
      ? {
          alternates: {
            ...(canonical ? { canonical } : {}),
            ...(languages ? { languages } : {}),
          },
        }
      : {}),
    openGraph: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(canonical ? { url: canonical } : {}),
      ...(siteName ? { siteName } : {}),
      type: options.ogType ?? "website",
      locale,
      ...(image ? { images: [{ url: image }] } : {}),
    } as Metadata["openGraph"],
    twitter: {
      card: image ? (options.twitterCard ?? "summary_large_image") : "summary",
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(image ? { images: [image] } : {}),
    },
  };
}
