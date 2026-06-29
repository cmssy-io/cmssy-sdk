import {
  resolveApiUrl,
  type CmssyClientConfig,
} from "../content/content-client";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { SITE_CONFIG_QUERY, type CmssySiteConfig } from "./queries";

export interface CmssySiteLocales {
  defaultLocale: string;
  locales: string[];
}

const TTL_MS = 60_000;
const MAX_ENTRIES = 64;
const cache = new Map<string, { value: CmssySiteLocales; expires: number }>();

export async function resolveSiteLocales(
  config: CmssyClientConfig,
  options?: GraphqlRequestOptions,
): Promise<CmssySiteLocales> {
  const key = `${resolveApiUrl(config.apiUrl)}::${config.workspaceSlug}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  cache.delete(key);

  let value: CmssySiteLocales;
  try {
    const data = await graphqlRequest<{
      publicSiteConfig: CmssySiteConfig | null;
    }>(
      config,
      SITE_CONFIG_QUERY,
      { workspaceSlug: config.workspaceSlug },
      options,
      "site config",
    );
    const siteConfig = data.publicSiteConfig;
    const defaultLocale = siteConfig?.defaultLanguage || "en";
    const enabled = siteConfig?.enabledLanguages ?? [];
    value = {
      defaultLocale,
      locales: enabled.length > 0 ? enabled : [defaultLocale],
    };
  } catch {
    value = { defaultLocale: "en", locales: ["en"] };
  }

  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

export function splitLocaleFromPath(
  path: string[] | undefined,
  siteLocales: CmssySiteLocales,
): { locale: string; path: string[] | undefined } {
  const first = path?.[0];
  if (
    first &&
    first !== siteLocales.defaultLocale &&
    siteLocales.locales.includes(first)
  ) {
    return { locale: first, path: path!.slice(1) };
  }
  return { locale: siteLocales.defaultLocale, path };
}
