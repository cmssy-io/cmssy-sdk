import { cache } from "react";
import { CmssyServerLayout, graphqlRequest } from "@cmssy/react";
import type { CmssyLayoutGroup } from "@cmssy/react";
import { resolveEditorLayoutBlockData } from "@cmssy/react/internal-server";
import { resolveEditorOrigin } from "@cmssy/next";
import { isCmssyEditMode } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { EditableLayout } from "@/cmssy/editable-layout";

// The header and the footer are layout blocks: content, not markup. Fetching
// and rendering them is your app's, so both queries live here.
const LAYOUTS_QUERY = `query PublicPageLayouts($workspaceSlug: String!, $pageSlug: String!, $previewSecret: String) {
  public {
    page {
      layouts(workspaceSlug: $workspaceSlug, pageSlug: $pageSlug, previewSecret: $previewSecret) {
        position
        blocks { id type content style advanced order isActive }
        settings { desktopWidth mobileBehavior }
      }
    }
  }
}`;

const SITE_CONFIG_QUERY = `query PublicSiteConfig($workspaceSlug: String!) {
  public {
    siteConfig(workspaceSlug: $workspaceSlug) {
      defaultLanguage
      enabledLanguages
    }
  }
}`;

// Both slots render on every page; `cache` makes that one request each.
const fetchLayouts = cache(
  async (pageSlug: string, previewSecret: string | null) => {
    try {
      const data = await graphqlRequest<{
        public?: { page?: { layouts?: CmssyLayoutGroup[] | null } | null } | null;
      }>(
        cmssy,
        LAYOUTS_QUERY,
        { workspaceSlug: cmssy.workspaceSlug, pageSlug, previewSecret },
        { public: true, retry: {} },
        "page layouts",
      );
      return data.public?.page?.layouts ?? [];
    } catch (error) {
      console.error("[cmssy] page layouts could not be fetched", error);
      return [];
    }
  },
);

const fetchLocales = cache(async () => {
  try {
    const data = await graphqlRequest<{
      public?: {
        siteConfig?: {
          defaultLanguage: string | null;
          enabledLanguages: string[] | null;
        } | null;
      } | null;
    }>(
      cmssy,
      SITE_CONFIG_QUERY,
      { workspaceSlug: cmssy.workspaceSlug },
      { public: true, retry: {} },
      "site config",
    );
    const config = data.public?.siteConfig;
    // The languages are the workspace's, never this repo's.
    const defaultLocale = config?.defaultLanguage ?? "";
    const enabled = config?.enabledLanguages ?? [];
    return {
      defaultLocale,
      locales: enabled.length > 0 ? enabled : defaultLocale ? [defaultLocale] : [],
    };
  } catch (error) {
    console.error("[cmssy] site config could not be fetched", error);
    return { defaultLocale: "", locales: [] as string[] };
  }
});

export interface CmssyLayoutSlotProps {
  position: "header" | "footer";
  /**
   * The catch-all segments of the route rendering this slot, as routed. The
   * language prefix in them IS the language - reading it here keeps the route
   * statically renderable, where reading the request header would force every
   * page dynamic and kill ISR.
   */
  path?: string[];
  /** The page whose layout to render. Defaults to the site-wide header/footer. */
  page?: string;
}

/**
 * The site-wide header and footer, rendered the way each mode needs them:
 *
 *  - published traffic: server-rendered layout blocks, no client cost;
 *  - the editor: the same blocks through the edit bridge, fetched with the
 *    preview secret, so what you see is the draft you are editing.
 *
 * Getting this wrong is invisible - the site looks right while the editor shows
 * a header it can select but not fill, or the published version of one.
 */
export async function CmssyLayoutSlot({
  position,
  path,
  page = "/",
}: CmssyLayoutSlotProps) {
  const [editMode, { defaultLocale, locales }] = await Promise.all([
    isCmssyEditMode(),
    fetchLocales(),
  ]);

  const [first] = path ?? [];
  const locale =
    first && first !== defaultLocale && locales.includes(first)
      ? first
      : defaultLocale;

  const groups = await fetchLayouts(
    page,
    editMode ? cmssy.draftSecret : null,
  );

  if (!editMode) {
    return (
      <CmssyServerLayout
        groups={groups}
        blocks={blocks}
        position={position}
        locale={locale}
        defaultLocale={defaultLocale}
        enabledLocales={locales}
        config={cmssy}
      />
    );
  }

  const origin = resolveEditorOrigin(cmssy.editorOrigin);
  // The editor canvas renders stored content, and for a relation field that is
  // raw ids - so the server-resolved content is handed over with it.
  const editorData = await resolveEditorLayoutBlockData({
    groups,
    blocks,
    position,
    locale,
    defaultLocale,
    enabledLocales: locales,
    isPreview: true,
    config: cmssy,
  });

  return (
    <EditableLayout
      groups={groups}
      position={position}
      locale={locale}
      defaultLocale={defaultLocale}
      enabledLocales={locales}
      edit={{ editorOrigin: Array.isArray(origin) ? origin[0] : origin }}
      data={editorData.data}
      resolvedContent={editorData.content}
    />
  );
}
