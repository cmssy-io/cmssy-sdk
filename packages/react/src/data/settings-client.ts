import type { CmssyClientConfig } from "../content/content-client";
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
    { ...options, public: true },
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
