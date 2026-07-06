import type { Metadata } from "next";
import {
  fetchPageMeta,
  fetchSiteConfig,
  normalizeSlug,
  type CmssyClientConfig,
  type CmssyLocalizedValue,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";
import { resolveSeoBaseUrl, type SeoBaseUrlOption } from "./seo-base-url";
import { localizedPath, resolveSeoLocales } from "./seo-paths";

export interface BuildCmssyMetadataOptions extends SeoBaseUrlOption {
  /** Override the Open Graph / Twitter image (defaults to workspace branding). */
  image?: string;
  /** Open Graph type. Defaults to "website". */
  ogType?: string;
  /** Twitter card. Defaults to "summary_large_image" when an image exists. */
  twitterCard?: "summary" | "summary_large_image";
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
 *   export const generateMetadata = ({ params }) =>
 *     buildCmssyMetadata(cmssy, (await params).path);
 *
 * `path` is the catch-all segments with the locale prefix already stripped.
 */
export async function buildCmssyMetadata(
  config: CmssyNextConfig,
  path?: string | string[],
  options: BuildCmssyMetadataOptions = {},
): Promise<Metadata> {
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    org: config.org,
    workspaceSlug: config.workspaceSlug,
  };

  const [meta, siteConfig, baseUrl] = await Promise.all([
    fetchPageMeta(clientConfig, path).catch(() => null),
    fetchSiteConfig(clientConfig).catch(() => null),
    resolveSeoBaseUrl(config, options.baseUrl),
  ]);

  const { defaultLocale, locales: enabledLocales } = resolveSeoLocales(
    config,
    siteConfig,
  );
  const locale = (await config.resolveLocale?.()) ?? defaultLocale;
  const slug = normalizeSlug(path);

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
      ? Object.fromEntries(
          enabledLocales.map((l) => [
            l,
            `${baseUrl}${localizedPath(slug, l, defaultLocale)}`,
          ]),
        )
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
