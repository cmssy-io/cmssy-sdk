import type { ComponentType } from "react";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  createCmssyClient,
  CmssyServerPage,
  type BlockDefinition,
  type CmssyBlockAuthContext,
  type CmssyBlockWorkspace,
  type CmssyClientConfig,
  type CmssyFormDefinition,
  type CmssyPageData,
} from "@cmssy/react";
import type { EditBridgeConfig } from "@cmssy/react/client";
import { CmssyLocaleProvider } from "@cmssy/react/internal";
import {
  blocksToSchemas,
  resolveEditorBlockData,
} from "@cmssy/react/internal-server";
import {
  fetchPage,
  resolveForms,
  resolveSiteLocales,
  splitLocaleFromPath,
  isDevelopment,
  toCspOrigin,
  cmssySecretsMatch,
} from "@cmssy/core/internal";
import {
  resolveEditorOrigin,
  type CmssyConfig,
  type RetryOption,
} from "@cmssy/core";
import { CMSSY_EDIT_QUERY_PARAM, CMSSY_SECRET_QUERY_PARAM } from "@cmssy/core";
import { nextRetryMode } from "./retry-mode";

export interface CmssyEditorProps {
  page: CmssyPageData;
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  edit: EditBridgeConfig;
  forms?: Record<string, CmssyFormDefinition>;
  data?: Record<string, unknown>;
  resolvedContent?: Record<string, Record<string, unknown>>;
  appContext?: Record<string, unknown>;
}

export type CmssyAppContext =
  | Record<string, unknown>
  | ((args: {
      page: CmssyPageData;
      locale: string;
      path: string[];
    }) => Record<string, unknown> | Promise<Record<string, unknown>>);

export interface CreateCmssyPageOptions {
  editor?: ComponentType<CmssyEditorProps>;
  path?: string;
  appContext?: CmssyAppContext;
  retry?: RetryOption;
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

async function resolveEditorRequest(
  query: SearchParams,
  draftSecret: string,
): Promise<boolean> {
  if (!hasEditFlag(query[CMSSY_EDIT_QUERY_PARAM])) return false;
  const provided = firstValue(query[CMSSY_SECRET_QUERY_PARAM]);
  if (!provided || !draftSecret) return false;
  return cmssySecretsMatch(provided, draftSecret);
}

export function createCmssyPage(
  config: CmssyConfig,
  blocks: BlockDefinition[],
  options?: CreateCmssyPageOptions,
) {
  return buildCmssyPageRenderer(config, blocks, options, false);
}

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
  const client = createCmssyClient(clientConfig);
  const requestOptions = { retry: options?.retry ?? nextRetryMode() };
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

    const siteLocales = await resolveSiteLocales(clientConfig, requestOptions);
    const { defaultLocale, locales: enabledLocales } = siteLocales;

    const split = splitLocaleFromPath(path, siteLocales);
    const pagePath = split.path;
    const locale = config.resolveLocale
      ? await config.resolveLocale()
      : split.locale;

    const devWorkspaceId = devAllowed
      ? await client.resolveWorkspaceId(requestOptions)
      : undefined;

    const page = await fetchPage(clientConfig, pagePath, {
      previewSecret: editMode ? config.draftSecret : undefined,
      devPreview: devAllowed || undefined,
      devToken: devAllowed ? config.devToken : undefined,
      workspaceId: devWorkspaceId,
      ...requestOptions,
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
      blocksToSchemas(blocks),
      locale,
      defaultLocale,
      requestOptions,
    );
    const forms =
      Object.keys(resolvedForms).length > 0 ? resolvedForms : undefined;

    const localeContext = {
      current: locale,
      default: defaultLocale,
      enabled: enabledLocales,
    };

    const appContext =
      typeof options?.appContext === "function"
        ? await options.appContext({ page, locale, path: pagePath ?? [] })
        : options?.appContext;

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
        appContext,
      });
      return (
        <CmssyLocaleProvider value={localeContext}>
          <Editor
            page={page}
            locale={locale}
            defaultLocale={defaultLocale}
            enabledLocales={enabledLocales}
            edit={{
              editorOrigin: bridgeOrigin,
              ...(config.layout
                ? { layoutRegions: config.layout.regions }
                : {}),
            }}
            forms={forms}
            data={editorData.data}
            resolvedContent={editorData.content}
            appContext={appContext}
          />
        </CmssyLocaleProvider>
      );
    }

    const auth: CmssyBlockAuthContext | undefined = undefined;

    let workspace: CmssyBlockWorkspace | undefined;
    try {
      workspace = {
        id: await client.resolveWorkspaceId(requestOptions),
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
          appContext={appContext}
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
