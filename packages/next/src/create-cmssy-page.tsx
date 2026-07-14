// Rendering a cmssy page reads the request and the config, so this module belongs
// to the server tree only. `server-only` turns "imported from a client component"
// into a build error naming the file - the mistake used to surface as "missing
// required configuration" in the browser, which reads like a config problem and
// is really an import problem.
//
// It sits here rather than on the package entry on purpose: middleware and route
// handlers legitimately import that entry, and Turbopack does not resolve the
// react-server condition for them.
import "server-only";

import type { ComponentType } from "react";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import {
  createCmssyClient,
  fetchPage,
  resolveForms,
  resolveSiteLocales,
  splitLocaleFromPath,
  CmssyServerPage,
  type BlockDefinition,
  type CmssyBlockAuthContext,
  type CmssyBlockWorkspace,
  type CmssyClientConfig,
  type CmssyFormDefinition,
  type CmssyPageData,
} from "@cmssy/react";
import type { EditBridgeConfig } from "@cmssy/react/client";
import { CmssyLocaleProvider } from "@cmssy/react/client";
import { getCmssyUser } from "./auth-server";
import {
  isDevelopment,
  resolveEditorOrigin,
  type CmssyNextConfig,
} from "./config";
import { toCspOrigin } from "./csp";
import { CMSSY_EDIT_QUERY_PARAM, CMSSY_SECRET_QUERY_PARAM } from "./edit-mode";
import { cmssySecretsMatch } from "./secret-match";

export interface CmssyEditorProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  forms?: Record<string, CmssyFormDefinition>;
}

export interface CreateCmssyPageOptions {
  editor?: ComponentType<CmssyEditorProps>;
  path?: string;
}

interface CatchAllParams {
  path?: string[];
}

type SearchParams = Record<string, string | string[] | undefined>;

interface CatchAllProps {
  params?: Promise<CatchAllParams>;
  searchParams?: Promise<SearchParams>;
}

function hasEditFlag(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// `cmssyEdit=1` alone is not trusted - it must carry a `cmssySecret` matching
// the site's draft secret, otherwise anyone could view drafts and mount the
// editable UI (CMS-948). Only the editor iframe sends this pair; draft mode
// (the authenticated /api/draft route) shows draft CONTENT but never mounts
// the editor.
async function resolveEditorRequest(
  query: SearchParams,
  draftSecret: string,
): Promise<boolean> {
  if (!hasEditFlag(query[CMSSY_EDIT_QUERY_PARAM])) return false;
  const provided = firstValue(query[CMSSY_SECRET_QUERY_PARAM]);
  if (!provided || !draftSecret) return false;
  return cmssySecretsMatch(provided, draftSecret);
}

/**
 * Public catch-all page. Statically renderable: it never reads
 * `searchParams` or `headers()` - awaiting either forces every route
 * dynamic and kills ISR (CMS-952). Draft-mode preview (the authenticated
 * /api/draft cookie) still works per-request via `draftMode()`, which is
 * static-safe, and renders draft CONTENT without the editor (CMS-948).
 * The editor-iframe flow (`?cmssyEdit=1&cmssySecret=...`) is served by
 * the middleware rewrite (`cmssyEditRewrite`) onto the dynamic edit route
 * mounted with `createCmssyEditPage`.
 */
export function createCmssyPage(
  config: CmssyNextConfig,
  blocks: BlockDefinition[],
  options?: CreateCmssyPageOptions,
) {
  return buildCmssyPageRenderer(config, blocks, options, false);
}

/**
 * Editor page for the middleware-rewritten edit route
 * (`app/cmssy-edit/[[...path]]/page.tsx`, `dynamic = "force-dynamic"`).
 * Re-verifies the `cmssyEdit` + `cmssySecret` pair itself, so a direct hit
 * on the route path (bypassing the middleware) cannot mount the editor.
 */
export function createCmssyEditPage(
  config: CmssyNextConfig,
  blocks: BlockDefinition[],
  options?: CreateCmssyPageOptions,
) {
  return buildCmssyPageRenderer(config, blocks, options, true);
}

function buildCmssyPageRenderer(
  config: CmssyNextConfig,
  blocks: BlockDefinition[],
  options: CreateCmssyPageOptions | undefined,
  editRoute: boolean,
) {
  if (!Array.isArray(blocks)) {
    throw new Error(
      "cmssy: createCmssyPage(config, blocks) requires a blocks array — pass your defineBlock(...) array",
    );
  }
  const Editor = options?.editor;
  const clientConfig: CmssyClientConfig = {
    apiUrl: config.apiUrl,
    org: config.org,
    workspaceSlug: config.workspaceSlug,
  };
  // Hoisted so resolveWorkspaceId is memoized across requests (no per-render
  // site-config fetch).
  const client = createCmssyClient(clientConfig);
  const fixedPath = options?.path
    ?.split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return async function CmssyCatchAllPage({
    params,
    searchParams,
  }: CatchAllProps) {
    const path =
      fixedPath ?? (params ? ((await params).path ?? undefined) : undefined);
    const { isEnabled } = await draftMode();

    // editorActive mounts the editable UI (verified editor iframe only);
    // editMode additionally covers draft-mode preview, which fetches draft
    // content but renders the plain, selectable page. Only the edit route
    // reads searchParams - the public route must stay static.
    let editorActive = false;
    if (editRoute) {
      const query = searchParams ? await searchParams : {};
      editorActive = await resolveEditorRequest(query, config.draftSecret);
      if (!editorActive) {
        notFound();
      }
    }
    const editMode = isEnabled || editorActive;
    const devAllowed = isDevelopment() && Boolean(config.devToken?.trim());

    let locale: string;
    let pagePath = path;
    let defaultLocale: string;
    let enabledLocales = config.enabledLocales;

    if (config.resolveLocale) {
      // The workspace knows its default language, so ask it rather than assume
      // English - the lookup is cached, and a Norwegian-first site would
      // otherwise treat "no" as a non-default language and prefix every URL.
      defaultLocale =
        config.defaultLocale ??
        (await resolveSiteLocales(clientConfig)).defaultLocale;
      locale = await config.resolveLocale();
    } else {
      const siteLocales = await resolveSiteLocales(clientConfig);
      defaultLocale = config.defaultLocale ?? siteLocales.defaultLocale;
      const locales = config.enabledLocales ?? siteLocales.locales;
      enabledLocales = locales;
      const split = splitLocaleFromPath(path, { defaultLocale, locales });
      locale = split.locale;
      pagePath = split.path;
    }

    const devWorkspaceId = devAllowed
      ? await client.resolveWorkspaceId()
      : undefined;

    const page = await fetchPage(clientConfig, pagePath, {
      previewSecret: editMode ? config.draftSecret : undefined,
      devPreview: devAllowed || undefined,
      devToken: devAllowed ? config.devToken : undefined,
      workspaceId: devWorkspaceId,
    });

    if (!page) {
      notFound();
    }

    if (editorActive && !Editor) {
      throw new Error(
        'cmssy: edit/dev mode requires options.editor — pass a "use client" editor that imports your blocks and renders <CmssyEditablePage blocks={blocks} … />',
      );
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

    if (editorActive && Editor) {
      const bridgeOrigin = resolveBridgeOrigin(config.editorOrigin);
      return (
        <CmssyLocaleProvider value={localeContext}>
          <Editor
            page={page}
            locale={locale}
            defaultLocale={defaultLocale}
            enabledLocales={enabledLocales}
            edit={{ editorOrigin: bridgeOrigin }}
            forms={forms}
          />
        </CmssyLocaleProvider>
      );
    }

    // Resolve member auth (only when auth is configured) and workspace
    // identity server-side, so blocks read them from context instead of
    // refetching client-side. Both degrade to undefined on failure.
    let auth: CmssyBlockAuthContext | undefined;
    if (config.auth) {
      try {
        const user = await getCmssyUser(config);
        auth = {
          isAuthenticated: !!user,
          member: user ? { recordId: user.recordId, email: user.email } : null,
        };
      } catch {
        auth = undefined;
      }
    }

    let workspace: CmssyBlockWorkspace | undefined;
    try {
      workspace = {
        id: await client.resolveWorkspaceId(),
        slug: config.workspaceSlug,
      };
    } catch {
      workspace = undefined;
    }

    return (
      <CmssyLocaleProvider value={localeContext}>
        <CmssyServerPage
          page={page}
          blocks={blocks}
          locale={locale}
          defaultLocale={defaultLocale}
          enabledLocales={enabledLocales}
          forms={forms}
          auth={auth}
          workspace={workspace}
        />
      </CmssyLocaleProvider>
    );
  };
}

function resolveBridgeOrigin(
  editorOrigin: string | string[] | undefined,
): string | string[] {
  const resolved = resolveEditorOrigin(editorOrigin);
  const origins = (Array.isArray(resolved) ? resolved : [resolved]).map(
    (origin) => toCspOrigin(origin.trim()),
  );
  if (origins.length === 0) {
    throw new Error("cmssy: editorOrigin must be set to frame the editor");
  }
  if (origins.includes("*") && !isDevelopment()) {
    throw new Error(
      "cmssy: editorOrigin '*' is only allowed in development; set a concrete editor origin (e.g. https://cmssy.io) for production",
    );
  }
  return origins.length === 1 ? origins[0]! : origins;
}
