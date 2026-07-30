import type { CmssyClientConfig } from "@cmssy/core";
import { resolveSiteLocales } from "@cmssy/core/internal";

export interface RenderLocaleInput {
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  config?: CmssyClientConfig;
}

export interface RenderLocale {
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
}

let warned = false;

export async function resolveRenderLocale({
  locale,
  defaultLocale,
  enabledLocales,
  config,
}: RenderLocaleInput): Promise<RenderLocale> {
  if (locale && defaultLocale) return { locale, defaultLocale, enabledLocales };

  if (config) {
    const site = await resolveSiteLocales(config);
    return {
      locale: locale ?? defaultLocale ?? site.defaultLocale,
      defaultLocale: defaultLocale ?? site.defaultLocale,
      enabledLocales: enabledLocales ?? site.locales,
    };
  }

  if (process.env.NODE_ENV !== "production" && !warned) {
    warned = true;
    console.warn(
      "[cmssy] Rendering in \"en\": no locale was passed and no config was given to " +
        "look the workspace's default language up. Pass `locale` (from the route) " +
        "or `config`, or a workspace whose default language is not English will " +
        "render its header and footer in the wrong one.",
    );
  }

  return {
    locale: locale ?? defaultLocale ?? "en",
    defaultLocale: defaultLocale ?? "en",
    enabledLocales,
  };
}
