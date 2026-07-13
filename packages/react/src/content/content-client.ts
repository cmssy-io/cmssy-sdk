// Content/delivery data shapes live in @cmssy/types (single source of truth);
// re-exported so consumers keep importing them from @cmssy/react.
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
  const doFetch =
    options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    throw new Error(
      "cmssy: no fetch implementation available - pass options.fetch",
    );
  }
  const trimmedSecret = options.previewSecret?.trim();
  const previewSecret = trimmedSecret ? trimmedSecret : null;
  const devToken = options.devToken?.trim();
  const devPreview = Boolean(options.devPreview && devToken);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (devPreview && devToken) {
    headers["authorization"] = `Bearer ${devToken}`;
    if (options.workspaceId) {
      headers["x-workspace-id"] = options.workspaceId;
    }
  }
  const response = await doFetch(resolvePublicUrl(config), {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: devPreview ? PUBLIC_PAGE_DEV_QUERY : PUBLIC_PAGE_QUERY,
      variables: {
        workspaceSlug: config.workspaceSlug,
        slug,
        previewSecret,
        ...(devPreview ? { devPreview: true } : {}),
      },
    }),
    signal: options.signal,
  });

  type PageResponse = {
    data?: {
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
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as PageResponse;
      if (body.errors && body.errors.length > 0) {
        detail = ` - ${body.errors
          .map((error) => error.message ?? "GraphQL error")
          .join("; ")}`;
      }
    } catch {
      detail = "";
    }
    throw new Error(`cmssy: page fetch failed (${response.status})${detail}`);
  }

  let json: PageResponse;
  try {
    json = (await response.json()) as PageResponse;
  } catch {
    throw new Error("cmssy: invalid JSON response from the page query");
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new Error(`cmssy: page fetch error - ${message}`);
  }
  const page = json.data?.public?.page?.get;
  if (!page) return null;
  const draft = previewSecret !== null || devPreview;
  const blocks = (draft ? page.blocks : page.publishedBlocks) ?? [];
  return { id: page.id, blocks };
}

export async function fetchPageById(
  config: CmssyClientConfig,
  pageId: string,
  options: Pick<FetchPageOptions, "fetch" | "signal"> = {},
): Promise<CmssyPageData | null> {
  const doFetch =
    options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    throw new Error(
      "cmssy: no fetch implementation available - pass options.fetch",
    );
  }
  const response = await doFetch(resolvePublicUrl(config), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: PUBLIC_PAGE_BY_ID_QUERY,
      variables: { workspaceSlug: config.workspaceSlug, pageId },
    }),
    signal: options.signal,
  });

  type PageByIdResponse = {
    data?: {
      public?: {
        page?: {
          getById?: {
            id: string;
            publishedBlocks?: RawBlock[] | null;
          } | null;
        } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as PageByIdResponse;
      if (body.errors && body.errors.length > 0) {
        detail = ` - ${body.errors
          .map((error) => error.message ?? "GraphQL error")
          .join("; ")}`;
      }
    } catch {
      detail = "";
    }
    throw new Error(
      `cmssy: page-by-id fetch failed (${response.status})${detail}`,
    );
  }

  let json: PageByIdResponse;
  try {
    json = (await response.json()) as PageByIdResponse;
  } catch {
    throw new Error("cmssy: invalid JSON response from the page-by-id query");
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new Error(`cmssy: page-by-id fetch error - ${message}`);
  }
  const page = json.data?.public?.page?.getById;
  if (!page) return null;
  return { id: page.id, blocks: page.publishedBlocks ?? [] };
}

export async function fetchPages(
  config: CmssyClientConfig,
  options: Pick<FetchPageOptions, "fetch" | "signal"> = {},
): Promise<CmssyPageSummary[]> {
  const doFetch =
    options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    throw new Error(
      "cmssy: no fetch implementation available - pass options.fetch",
    );
  }
  const response = await doFetch(resolvePublicUrl(config), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: PUBLIC_PAGES_QUERY,
      variables: { workspaceSlug: config.workspaceSlug },
    }),
    signal: options.signal,
  });

  type PagesResponse = {
    data?: {
      public?: {
        page?: { list?: CmssyPageSummary[] | null } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    throw new Error(`cmssy: pages fetch failed (${response.status})`);
  }
  let json: PagesResponse;
  try {
    json = (await response.json()) as PagesResponse;
  } catch {
    throw new Error("cmssy: invalid JSON response from the pages query");
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new Error(`cmssy: pages fetch error - ${message}`);
  }
  return json.data?.public?.page?.list ?? [];
}

export async function fetchPageMeta(
  config: CmssyClientConfig,
  path: string | string[] | undefined,
  options: Pick<FetchPageOptions, "fetch" | "signal"> = {},
): Promise<CmssyPageMeta | null> {
  const slug = normalizeSlug(path);
  const doFetch =
    options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    throw new Error(
      "cmssy: no fetch implementation available - pass options.fetch",
    );
  }
  const response = await doFetch(resolvePublicUrl(config), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: PUBLIC_PAGE_META_QUERY,
      variables: { workspaceSlug: config.workspaceSlug, slug },
    }),
    signal: options.signal,
  });

  type MetaResponse = {
    data?: {
      public?: {
        page?: { get?: CmssyPageMeta | null } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    throw new Error(`cmssy: page meta fetch failed (${response.status})`);
  }
  let json: MetaResponse;
  try {
    json = (await response.json()) as MetaResponse;
  } catch {
    throw new Error("cmssy: invalid JSON response from the page meta query");
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new Error(`cmssy: page meta fetch error - ${message}`);
  }
  return json.data?.public?.page?.get ?? null;
}

export async function fetchLayouts(
  config: CmssyClientConfig,
  path: string | string[] | undefined,
  options: FetchPageOptions = {},
): Promise<CmssyLayoutGroup[]> {
  const pageSlug = normalizeSlug(path);
  const doFetch =
    options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    throw new Error(
      "cmssy: no fetch implementation available - pass options.fetch",
    );
  }
  const trimmedSecret = options.previewSecret?.trim();
  const previewSecret = trimmedSecret ? trimmedSecret : null;
  const response = await doFetch(resolvePublicUrl(config), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: PUBLIC_PAGE_LAYOUTS_QUERY,
      variables: {
        workspaceSlug: config.workspaceSlug,
        pageSlug,
        previewSecret,
      },
    }),
    signal: options.signal,
  });

  type LayoutsResponse = {
    data?: {
      public?: {
        page?: { layouts?: CmssyLayoutGroup[] | null } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    throw new Error(`cmssy: layouts fetch failed (${response.status})`);
  }
  let json: LayoutsResponse;
  try {
    json = (await response.json()) as LayoutsResponse;
  } catch {
    throw new Error("cmssy: invalid JSON response from the layouts query");
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new Error(`cmssy: layouts fetch error - ${message}`);
  }
  return json.data?.public?.page?.layouts ?? [];
}
