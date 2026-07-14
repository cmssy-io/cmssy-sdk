import {
  CMSSY_EDIT_HEADER,
  CMSSY_LOCALE_HEADER,
  fetchLayouts,
  fetchPage,
  resolveSiteLocales,
  splitLocaleFromPath,
  type CmssyConfig,
  type CmssyLayoutGroup,
  type CmssyPageData,
} from "@cmssy/core";

export interface CmssyPageResult {
  page: CmssyPageData | null;
  layouts: CmssyLayoutGroup[];
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  /** True for a verified editor request. The edit route renders the bridge. */
  isEdit: boolean;
}

/**
 * Everything a cmssy page needs, from a plain Request. No framework globals: the
 * locale comes from the header the middleware set (falling back to the path, so
 * a prerendered page still knows its language), and the editor flag comes from
 * the same signal the Next adapter uses - because it is the same protocol, not
 * a Next protocol.
 */
export async function loadCmssyPage(
  config: CmssyConfig,
  request: Request,
  url: URL,
): Promise<CmssyPageResult> {
  const isEdit = request.headers.get(CMSSY_EDIT_HEADER) === "1";
  const siteLocales = await resolveSiteLocales(config);

  const segments = url.pathname
    .replace(/^\/cmssy-edit/, "")
    .split("/")
    .filter(Boolean);
  const fromPath = splitLocaleFromPath(segments, siteLocales);
  const locale = request.headers.get(CMSSY_LOCALE_HEADER) ?? fromPath.locale;

  const path = fromPath.path;
  const previewSecret = isEdit ? config.draftSecret : undefined;

  const [page, layouts] = await Promise.all([
    fetchPage(config, path, { previewSecret }),
    fetchLayouts(config, path, { previewSecret }),
  ]);

  return {
    page,
    layouts,
    locale,
    defaultLocale: siteLocales.defaultLocale,
    enabledLocales: siteLocales.locales,
    isEdit,
  };
}
