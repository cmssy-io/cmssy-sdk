import type { ComponentType } from "react";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  createCmssyClient,
  fetchPage,
  resolveForms,
  resolveSiteLocales,
  splitLocaleFromPath,
  CmssyServerPage,
  resolveEditorBlockData,
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
  type CmssyConfig,
} from "@cmssy/core";
import { toCspOrigin } from "@cmssy/core";
import { CMSSY_EDIT_QUERY_PARAM, CMSSY_SECRET_QUERY_PARAM } from "@cmssy/core";
import { cmssySecretsMatch } from "@cmssy/core";

export interface CmssyEditorProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  forms?: Record<string, CmssyFormDefinition>;
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
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
  config: CmssyConfig,
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
  config: CmssyConfig,
  blocks: BlockDefinition[],
  options?: CreateCmssyPageOptions,
) {
  return buildCmssyPageRenderer(config, blocks, options, true);
}

function buildCmssyPageRenderer(
  config: CmssyConfig,
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
        if (isDevelopment()) {
          return renderEditDiagnosticsPage(config, query);
        }
        notFound();
      }
    }
    const editMode = isEnabled || editorActive;
    const devAllowed = isDevelopment() && Boolean(config.devToken?.trim());

    let locale: string;
    let pagePath = path;

    // The workspace knows its default language, so ask it rather than assume
    // English - the lookup is cached, and a Norwegian-first site would
    // otherwise treat "no" as a non-default language and prefix every URL.
    const siteLocales = await resolveSiteLocales(clientConfig);
    const { defaultLocale, locales: enabledLocales } = siteLocales;

    if (config.resolveLocale) {
      locale = await config.resolveLocale();
    } else {
      const split = splitLocaleFromPath(path, siteLocales);
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
      enabled: enabledLocales,
    };

    if (editorActive && Editor) {
      const bridgeOrigin = resolveBridgeOrigin(config.editorOrigin);
      const editorData = await resolveEditorBlockData({
        page,
        blocks,
        locale,
        defaultLocale,
        enabledLocales,
        forms,
        isPreview: true,
        config,
      });
      return (
        <CmssyLocaleProvider value={localeContext}>
          <Editor
            page={page}
            locale={locale}
            defaultLocale={defaultLocale}
            enabledLocales={enabledLocales}
            edit={{ editorOrigin: bridgeOrigin }}
            forms={forms}
            data={editorData.data}
            resolvedContent={editorData.content}
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
          config={config}
          forms={forms}
          auth={auth}
          workspace={workspace}
          editMode={editMode}
        />
      </CmssyLocaleProvider>
    );
  };
}

async function renderEditDiagnosticsPage(
  config: CmssyConfig,
  query: SearchParams,
) {
  const { collectEditDiagnostics, renderEditDiagnostics } =
    await import("@cmssy/core/preflight");
  const diagnostics = await collectEditDiagnostics({
    config,
    providedSecret: firstValue(query[CMSSY_SECRET_QUERY_PARAM]) ?? null,
    devOrigin: await resolveDevOrigin(),
  });
  return (
    <div
      dangerouslySetInnerHTML={{ __html: renderEditDiagnostics(diagnostics) }}
    />
  );
}

async function resolveDevOrigin(): Promise<string | undefined> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    if (!host) return undefined;
    const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  } catch {
    return undefined;
  }
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
