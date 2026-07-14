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
    { ...options, public: true, retry: options.retry ?? {} },
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

const workspaceIdCache = new Map<string, Promise<string>>();

/**
 * Every authenticated operation needs the workspace id, and it never changes for
 * a given (endpoint, workspace) pair - so it is resolved once and shared. A
 * failed lookup is evicted, otherwise one bad request would be cached forever.
 */
export function cachedWorkspaceId(config: CmssyClientConfig): Promise<string> {
  const key = `${resolveApiUrl(config.apiUrl)}::${config.workspaceSlug}`;
  const existing = workspaceIdCache.get(key);
  if (existing) return existing;
  const fresh = resolveWorkspaceId(config).catch((err: unknown) => {
    workspaceIdCache.delete(key);
    throw err;
  });
  workspaceIdCache.set(key, fresh);
  return fresh;
}

export function clearWorkspaceIdCache(): void {
  workspaceIdCache.clear();
}
