import type { ReactNode } from "react";
import {
  fetchPageById,
  fetchSiteConfig,
  resolveForms,
  resolveSiteLocales,
  CmssyServerPage,
  type BlockDefinition,
  type CmssyClientConfig,
} from "@cmssy/react";
import { CmssyLocaleProvider } from "@cmssy/react/client";
import type { CmssyNextConfig } from "./config";

export interface CreateCmssyNotFoundOptions {
  /**
   * Rendered when no 404 page is configured in Settings, or the configured
   * page has no published content. Defaults to a minimal built-in message.
   */
  fallback?: ReactNode;
}

function DefaultNotFound() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>404</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>Page not found</p>
    </main>
  );
}

/**
 * Renders the workspace's configured 404 page (Settings → 404 page) as the
 * body of Next's `app/not-found.tsx`, preserving the HTTP 404 status. Drop the
 * returned component in as the default export of `app/not-found.tsx`:
 *
 *   export default createCmssyNotFound(cmssy, blocks);
 */
export function createCmssyNotFound(
  config: CmssyNextConfig,
  blocks: BlockDefinition[],
  options?: CreateCmssyNotFoundOptions,
) {
  if (!Array.isArray(blocks)) {
    throw new Error(
      "cmssy: createCmssyNotFound(config, blocks) requires a blocks array — pass your defineBlock(...) array",
    );
  }
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    org: config.org,
    workspaceSlug: config.workspaceSlug,
  };
  const fallback = options?.fallback ?? <DefaultNotFound />;

  return async function CmssyNotFound() {
    // The 404 path is itself a fallback — never let a backend hiccup turn it
    // into a 500. Any fetch/render failure degrades to the fallback element.
    try {
      const siteConfig = await fetchSiteConfig(clientConfig);
      const notFoundPageId = siteConfig?.notFoundPageId;
      if (!notFoundPageId) return fallback;

      const page = await fetchPageById(clientConfig, notFoundPageId);
      if (!page || page.blocks.length === 0) return fallback;

      let locale: string;
      let defaultLocale: string;
      let enabledLocales = config.enabledLocales;

      if (config.resolveLocale) {
        defaultLocale = config.defaultLocale ?? "en";
        locale = await config.resolveLocale();
      } else {
        const siteLocales = await resolveSiteLocales(clientConfig);
        defaultLocale = config.defaultLocale ?? siteLocales.defaultLocale;
        enabledLocales = config.enabledLocales ?? siteLocales.locales;
        locale = defaultLocale;
      }

      const resolvedForms = await resolveForms(
        clientConfig,
        page.blocks,
        locale,
        defaultLocale,
      );
      const forms =
        Object.keys(resolvedForms).length > 0 ? resolvedForms : undefined;

      const localeContext = {
        current: locale,
        default: defaultLocale,
        enabled:
          enabledLocales && enabledLocales.length > 0
            ? enabledLocales
            : Array.from(new Set([defaultLocale, locale])),
      };

      return (
        <CmssyLocaleProvider value={localeContext}>
          <CmssyServerPage
            page={page}
            blocks={blocks}
            locale={locale}
            defaultLocale={defaultLocale}
            enabledLocales={enabledLocales}
            forms={forms}
          />
        </CmssyLocaleProvider>
      );
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[cmssy] not-found page render failed", err);
      }
      return fallback;
    }
  };
}
