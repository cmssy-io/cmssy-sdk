import {
  resolveApiUrl,
  type CmssyClientConfig,
} from "../content/content-client";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { SITE_CONFIG_QUERY, type CmssySiteConfig } from "./queries";

export async function fetchSiteConfig(
  config: CmssyClientConfig,
  options: GraphqlRequestOptions = {},
): Promise<CmssySiteConfig | null> {
  const data = await graphqlRequest<{
    public?: { siteConfig?: CmssySiteConfig | null } | null;
  }>(
    config,
    SITE_CONFIG_QUERY,
    { workspaceSlug: config.workspaceSlug },
    { ...options, public: true, retry: options.retry ?? "build" },
    "site config query",
  );
  return data.public?.siteConfig ?? null;
}

export async function resolveWorkspaceId(
  config: CmssyClientConfig,
  options: GraphqlRequestOptions = {},
): Promise<string> {
  const siteConfig = await fetchSiteConfig(config, options);
  if (!siteConfig?.workspaceId) {
    throw new Error(
      `cmssy: could not resolve workspaceId for "${config.workspaceSlug}"`,
    );
  }
  return siteConfig.workspaceId;
}

const MAX_ENTRIES = 64;
const workspaceIdCache = new Map<string, Promise<string>>();

function cacheKey(config: CmssyClientConfig): string {
  return `${resolveApiUrl(config.apiUrl)}::${config.org}::${config.workspaceSlug}`;
}

export function cachedWorkspaceId(
  config: CmssyClientConfig,
  options: GraphqlRequestOptions = {},
): Promise<string> {
  const key = cacheKey(config);
  const existing = workspaceIdCache.get(key);
  if (existing) return existing;
  const fresh = resolveWorkspaceId(config, options).catch((err: unknown) => {
    workspaceIdCache.delete(key);
    throw err;
  });
  if (workspaceIdCache.size >= MAX_ENTRIES) workspaceIdCache.clear();
  workspaceIdCache.set(key, fresh);
  return fresh;
}

export function primeWorkspaceId(
  config: CmssyClientConfig,
  workspaceId: string,
): void {
  workspaceIdCache.set(cacheKey(config), Promise.resolve(workspaceId));
}

export function clearWorkspaceIdCache(): void {
  workspaceIdCache.clear();
}
