import type { CmssyClientConfig } from "../content/content-client";
import { resolveSiteLocales } from "../data/site-locales";

export interface RenderLocaleInput {
  locale?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  /** The workspace to ask. Without it the languages cannot be resolved. */
  config?: CmssyClientConfig;
}

export interface RenderLocale {
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
}

let warned = false;

/**
 * The language to render in. The workspace already knows its default language,
 * so hardcoding "en" is the SDK guessing at something the platform can answer:
 * a Norwegian-first workspace got an English header under a Norwegian page, with
 * no error to show for it.
 *
 * Precedence: what the caller passed (a locale in the URL is the caller's job to
 * read) → what the workspace says → "en", which now only happens when neither is
 * available, and says so in dev.
 */
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
        "render its chrome in the wrong one.",
    );
  }

  return {
    locale: locale ?? defaultLocale ?? "en",
    defaultLocale: defaultLocale ?? "en",
    enabledLocales,
  };
}
