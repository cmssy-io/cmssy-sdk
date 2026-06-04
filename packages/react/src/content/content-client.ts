export interface CmssyClientConfig {
  apiUrl: string;
  workspaceSlug: string;
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
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export interface RawBlock {
  id: string;
  type: string;
  content: unknown;
}

export interface CmssyPageData {
  id: string;
  blocks: RawBlock[];
}

export interface RawLayoutBlock {
  id: string;
  type: string;
  content: unknown;
  order: number;
  isActive: boolean;
}

export interface CmssyLayoutGroup {
  position: string;
  blocks: RawLayoutBlock[];
}

const PUBLIC_PAGE_QUERY = `query PublicPage($workspaceSlug: String!, $slug: String!, $previewSecret: String) {
  publicPage(workspaceSlug: $workspaceSlug, slug: $slug, previewSecret: $previewSecret) {
    id
    blocks { id type content }
    publishedBlocks { id type content }
  }
}`;

const PUBLIC_PAGE_LAYOUTS_QUERY = `query PublicPageLayouts($workspaceSlug: String!, $pageSlug: String!, $previewSecret: String) {
  publicPageLayouts(workspaceSlug: $workspaceSlug, pageSlug: $pageSlug, previewSecret: $previewSecret) {
    position
    blocks { id type content order isActive }
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
  const response = await doFetch(config.apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: PUBLIC_PAGE_QUERY,
      variables: {
        workspaceSlug: config.workspaceSlug,
        slug,
        previewSecret,
      },
    }),
    signal: options.signal,
  });

  type PageResponse = {
    data?: {
      publicPage?: {
        id: string;
        blocks?: RawBlock[] | null;
        publishedBlocks?: RawBlock[] | null;
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
  const page = json.data?.publicPage;
  if (!page) return null;
  const draft = previewSecret !== null;
  const blocks = (draft ? page.blocks : page.publishedBlocks) ?? [];
  return { id: page.id, blocks };
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
  const response = await doFetch(config.apiUrl, {
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
    data?: { publicPageLayouts?: CmssyLayoutGroup[] | null };
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
  return json.data?.publicPageLayouts ?? [];
}
