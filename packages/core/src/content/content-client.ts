// Content/delivery data shapes live in @cmssy/types (single source of truth);
// re-exported so consumers import them from @cmssy/core.
import type {
  CmssyClientConfig,
  RawBlock,
  CmssyPageData,
  RawLayoutBlock,
  CmssyLayoutSettings,
  CmssyLayoutGroup,
  CmssyPageSummary,
  CmssyLocalizedValue,
  CmssyPageMeta,
} from "@cmssy/types";

import { postGraphql, type RetryPolicy } from "../data/http";

export type {
  CmssyClientConfig,
  RawBlock,
  CmssyPageData,
  RawLayoutBlock,
  CmssyLayoutSettings,
  CmssyLayoutGroup,
  CmssyPageSummary,
  CmssyLocalizedValue,
  CmssyPageMeta,
};

/**
 * The cmssy cloud GraphQL delivery endpoint. It is the same for every workspace,
 * so consumers never need to set it - `apiUrl` defaults to this. Self-hosted /
 * staging deployments override it via config.
 */
export const DEFAULT_CMSSY_API_URL = "https://api.cmssy.io/graphql";

export function resolveApiUrl(apiUrl: string | undefined): string {
  const explicit = apiUrl?.trim();
  if (explicit) return explicit;
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const fromEnv = env?.CMSSY_API_URL?.trim() ?? "";
  return fromEnv.length > 0 ? fromEnv : DEFAULT_CMSSY_API_URL;
}

/**
 * Public delivery endpoint for a workspace: the org-scoped path
 * `{base}/public/{orgSlug}/{workspaceSlug}/graphql`. `apiUrl` is the GraphQL
 * base (its trailing `/graphql` is stripped); the org path is what tells the
 * backend which workspace to serve, so slugs only need to be unique per org.
 */
export function resolvePublicUrl(config: CmssyClientConfig): string {
  const base = resolveApiUrl(config.apiUrl).replace(/\/graphql\/?$/, "");
  return `${base}/public/${config.org}/${config.workspaceSlug}/graphql`;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  headers?: { get: (name: string) => string | null };
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<FetchLikeResponse>;

export interface FetchPageOptions {
  previewSecret?: string;
  devPreview?: boolean;
  devToken?: string;
  workspaceId?: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
  retry?: RetryPolicy | false;
}

export const PUBLIC_PAGE_QUERY = `query PublicPage($workspaceSlug: String!, $slug: String!, $previewSecret: String) {
  public {
    page {
      get(workspaceSlug: $workspaceSlug, slug: $slug, previewSecret: $previewSecret) {
        id
        blocks { id type content style advanced }
        publishedBlocks { id type content style advanced }
      }
    }
  }
}`;

export const PUBLIC_PAGE_DEV_QUERY = `query PublicPage($workspaceSlug: String!, $slug: String!, $previewSecret: String, $devPreview: Boolean) {
  public {
    page {
      get(workspaceSlug: $workspaceSlug, slug: $slug, previewSecret: $previewSecret, devPreview: $devPreview) {
        id
        blocks { id type content style advanced }
        publishedBlocks { id type content style advanced }
      }
    }
  }
}`;

export const PUBLIC_PAGE_BY_ID_QUERY = `query PublicPageById($workspaceSlug: String!, $pageId: ID!) {
  public {
    page {
      getById(workspaceSlug: $workspaceSlug, pageId: $pageId) {
        id
        publishedBlocks { id type content style advanced }
      }
    }
  }
}`;

export const PUBLIC_PAGES_QUERY = `query PublicPages($workspaceSlug: String!) {
  public {
    page {
      list(workspaceSlug: $workspaceSlug) {
        id
        slug
        updatedAt
        publishedAt
      }
    }
  }
}`;

export const PUBLIC_PAGE_META_QUERY = `query PublicPageMeta($workspaceSlug: String!, $slug: String!) {
  public {
    page {
      get(workspaceSlug: $workspaceSlug, slug: $slug) {
        id
        seoTitle
        seoDescription
        seoKeywords
        displayName
      }
    }
  }
}`;

export const PUBLIC_PAGE_LAYOUTS_QUERY = `query PublicPageLayouts($workspaceSlug: String!, $pageSlug: String!, $previewSecret: String) {
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

export function normalizeSlug(path: string | string[] | undefined): string {
  if (Array.isArray(path)) {
    const joined = path.filter(Boolean).join("/");
    return joined ? `/${joined}` : "/";
  }
  if (!path || path === "/") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export async function fetchPage(
  config: CmssyClientConfig,
  path: string | string[] | undefined,
  options: FetchPageOptions = {},
): Promise<CmssyPageData | null> {
  const slug = normalizeSlug(path);
  const trimmedSecret = options.previewSecret?.trim();
  const previewSecret = trimmedSecret ? trimmedSecret : null;
  const devToken = options.devToken?.trim();
  const devPreview = Boolean(options.devPreview && devToken);
  const headers: Record<string, string> = {};
  if (devPreview && devToken) {
    headers["authorization"] = `Bearer ${devToken}`;
    if (options.workspaceId) {
      headers["x-workspace-id"] = options.workspaceId;
    }
  }

  type PageData = {
    public?: {
      page?: {
        get?: {
          id: string;
          blocks?: RawBlock[] | null;
          publishedBlocks?: RawBlock[] | null;
        } | null;
      } | null;
    } | null;
  };

  const data = await postGraphql<PageData>(
    resolvePublicUrl(config),
    devPreview ? PUBLIC_PAGE_DEV_QUERY : PUBLIC_PAGE_QUERY,
    {
      workspaceSlug: config.workspaceSlug,
      slug,
      previewSecret,
      ...(devPreview ? { devPreview: true } : {}),
    },
    {
      fetch: options.fetch,
      signal: options.signal,
      headers,
      retry: options.retry ?? {},
      label: "page fetch",
    },
  );
  const page = data?.public?.page?.get;
  if (!page) return null;
  const draft = previewSecret !== null || devPreview;
  const blocks = (draft ? page.blocks : page.publishedBlocks) ?? [];
  return { id: page.id, blocks };
}

export async function fetchPageById(
  config: CmssyClientConfig,
  pageId: string,
  options: Pick<FetchPageOptions, "fetch" | "signal" | "retry"> = {},
): Promise<CmssyPageData | null> {
  type PageByIdData = {
    public?: {
      page?: {
        getById?: {
          id: string;
          publishedBlocks?: RawBlock[] | null;
        } | null;
      } | null;
    } | null;
  };

  const data = await postGraphql<PageByIdData>(
    resolvePublicUrl(config),
    PUBLIC_PAGE_BY_ID_QUERY,
    { workspaceSlug: config.workspaceSlug, pageId },
    {
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry ?? {},
      label: "page-by-id fetch",
    },
  );
  const page = data?.public?.page?.getById;
  if (!page) return null;
  return { id: page.id, blocks: page.publishedBlocks ?? [] };
}

export async function fetchPages(
  config: CmssyClientConfig,
  options: Pick<FetchPageOptions, "fetch" | "signal" | "retry"> = {},
): Promise<CmssyPageSummary[]> {
  type PagesData = {
    public?: {
      page?: { list?: CmssyPageSummary[] | null } | null;
    } | null;
  };

  const data = await postGraphql<PagesData>(
    resolvePublicUrl(config),
    PUBLIC_PAGES_QUERY,
    { workspaceSlug: config.workspaceSlug },
    {
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry ?? {},
      label: "pages fetch",
    },
  );
  return data?.public?.page?.list ?? [];
}

export async function fetchPageMeta(
  config: CmssyClientConfig,
  path: string | string[] | undefined,
  options: Pick<FetchPageOptions, "fetch" | "signal" | "retry"> = {},
): Promise<CmssyPageMeta | null> {
  const slug = normalizeSlug(path);

  type MetaData = {
    public?: {
      page?: { get?: CmssyPageMeta | null } | null;
    } | null;
  };

  const data = await postGraphql<MetaData>(
    resolvePublicUrl(config),
    PUBLIC_PAGE_META_QUERY,
    { workspaceSlug: config.workspaceSlug, slug },
    {
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry ?? {},
      label: "page meta fetch",
    },
  );
  return data?.public?.page?.get ?? null;
}

export async function fetchLayouts(
  config: CmssyClientConfig,
  path: string | string[] | undefined,
  options: FetchPageOptions = {},
): Promise<CmssyLayoutGroup[]> {
  const pageSlug = normalizeSlug(path);
  const trimmedSecret = options.previewSecret?.trim();
  const previewSecret = trimmedSecret ? trimmedSecret : null;

  type LayoutsData = {
    public?: {
      page?: { layouts?: CmssyLayoutGroup[] | null } | null;
    } | null;
  };

  const data = await postGraphql<LayoutsData>(
    resolvePublicUrl(config),
    PUBLIC_PAGE_LAYOUTS_QUERY,
    { workspaceSlug: config.workspaceSlug, pageSlug, previewSecret },
    {
      fetch: options.fetch,
      signal: options.signal,
      retry: options.retry ?? {},
      label: "layouts fetch",
    },
  );
  return data?.public?.page?.layouts ?? [];
}
