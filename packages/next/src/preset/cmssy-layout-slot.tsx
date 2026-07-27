import type { ComponentType } from "react";
import {
  CmssyServerLayout,
  resolveCmssyLayoutSlot,
  type BlockDefinition,
  type CmssyLayoutGroup,
  type ResolveCmssyLayoutSlotOptions,
} from "@cmssy/react";
import { type CmssyConfig, type LayoutPosition } from "@cmssy/core";

interface CmssyLayoutSlotBaseProps {
  config: CmssyConfig;
  blocks: BlockDefinition[];
  /**
   * Which layout position to render. Six exist - `top`, `header`,
   * `sidebar_left`, `sidebar_right`, `footer`, `bottom` - and most sites use
   * two of them; the type is what tells you about the other four.
   */
  position: LayoutPosition;
  /**
   * Whether to render through the edit bridge. A parameter rather than a
   * lookup: every way of asking the request - `headers()`, `draftMode()` - is a
   * dynamic API, and one read makes the whole route uncacheable. The route
   * segment already knows the answer, so it passes it.
   *
   * Required on purpose. A slot that guessed `false` in an edit route would
   * wrap draft content in published chrome, and nothing would report it.
   */
  editMode: boolean;
  /** The page whose layout to render. Defaults to the site-wide header/footer. */
  page?: string;
  /**
   * The client wrapper around `CmssyLazyLayout`, rendered in edit mode.
   *
   * Required, and a component rather than a loader: the block registry has to
   * be imported lazily ON THE CLIENT, and a function cannot cross the server
   * boundary. Without it the editor gets a header it can select and not fill -
   * which is why this is a type error rather than a runtime warning.
   */
  editable: ComponentType<{
    groups: CmssyLayoutGroup[];
    position: string;
    locale: string;
    defaultLocale: string;
    enabledLocales: string[];
    edit: { editorOrigin: string };
    data?: Record<string, unknown>;
    resolvedContent?: Record<string, Record<string, unknown>>;
    appContext?: Record<string, unknown>;
  }>;
  /** Forwarded untouched to every block as `context.app`. */
  appContext?: Record<string, unknown>;
}

/**
 * Where the language comes from - one of two, never neither.
 *
 * `path` is the catch-all segments **as routed**: the language prefix in them
 * IS the language, and reading it costs the route nothing. A caller with no
 * params (a root layout) has to resolve the language itself and pass `locale`;
 * there is deliberately no fallback to the request header, because a static
 * route never sees the header the proxy set and would render the wrong
 * language while looking like it worked.
 */
export type CmssyLayoutSlotLocaleSource =
  | { path: string[]; locale?: never }
  | { locale: string; path?: never };

export type CmssyLayoutSlotProps = CmssyLayoutSlotBaseProps &
  CmssyLayoutSlotLocaleSource;

/**
 * The site-wide header and footer, which are layout **blocks** rather than
 * markup the app owns. Rendered the way each mode needs them:
 *
 *  - published traffic: server-rendered blocks, no client cost;
 *  - the editor: the same blocks through the edit bridge, fetched with the
 *    preview secret and handed their server-resolved content, so a relation
 *    field shows records rather than the ids it stores.
 *
 * Getting any of that wrong is invisible - the site looks right while the
 * editor shows a header it cannot fill, or the published version of one. Every
 * app that wrote this by hand between 10.0 and 10.9 got at least one of the
 * three wrong, which is why it is back.
 */
export async function CmssyLayoutSlot({
  config,
  blocks,
  position,
  path,
  locale: explicitLocale,
  editMode,
  page = "/",
  editable: Editable,
  appContext,
}: CmssyLayoutSlotProps) {
  // `page` stays "/" by default here, where it always has been. The resolver
  // defaults to the routed page, which is what Astro and React Router have
  // always done - changing this side too would be a silent content change in
  // every Next app one release after the last one.
  const resolved = await resolveCmssyLayoutSlot(config, {
    position,
    blocks,
    editMode,
    page,
    appContext,
    ...(explicitLocale !== undefined
      ? { locale: explicitLocale }
      : { path: path ?? [] }),
  } as ResolveCmssyLayoutSlotOptions);

  const { groups, locale, defaultLocale, enabledLocales } = resolved;

  if (!editMode) {
    return (
      <CmssyServerLayout
        groups={groups}
        blocks={blocks}
        position={position}
        locale={locale}
        defaultLocale={defaultLocale}
        enabledLocales={enabledLocales}
        config={config}
        appContext={appContext}
      />
    );
  }

  const origin = resolved.editorOrigin;

  return (
    <Editable
      groups={groups}
      position={position}
      locale={locale}
      defaultLocale={defaultLocale}
      enabledLocales={enabledLocales}
      edit={{ editorOrigin: (Array.isArray(origin) ? origin[0] : origin) ?? "" }}
      data={resolved.data}
      resolvedContent={resolved.resolvedContent}
      appContext={appContext}
    />
  );
}
