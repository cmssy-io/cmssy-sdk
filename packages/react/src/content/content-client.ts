export interface CmssyClientConfig {
  apiUrl: string;
  workspaceSlug: string;
}

export interface FetchPageOptions {
  previewSecret?: string;
  fetch?: typeof fetch;
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

const PUBLIC_PAGE_QUERY = `query PublicPage($workspaceSlug: String!, $slug: String!, $previewSecret: String) {
  publicPage(workspaceSlug: $workspaceSlug, slug: $slug, previewSecret: $previewSecret) {
    id
    blocks { id type content }
    publishedBlocks { id type content }
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
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(config.apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: PUBLIC_PAGE_QUERY,
      variables: {
        workspaceSlug: config.workspaceSlug,
        slug,
        previewSecret: options.previewSecret ?? null,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`cmssy: page fetch failed (${response.status})`);
  }
  const json = (await response.json()) as {
    data?: {
      publicPage?: {
        id: string;
        blocks?: RawBlock[] | null;
        publishedBlocks?: RawBlock[] | null;
      } | null;
    };
  };
  const page = json.data?.publicPage;
  if (!page) return null;
  const draft = Boolean(options.previewSecret);
  const blocks = (draft ? page.blocks : page.publishedBlocks) ?? [];
  return { id: page.id, blocks };
}
