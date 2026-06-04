import type { CmssyClientConfig } from "../content/content-client";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";

export interface CmssySiteConfig {
  id: string;
  workspaceId: string;
  siteName: unknown;
  defaultLanguage: string | null;
  enabledLanguages: string[];
  enabledFeatures: string[];
  notFoundPageId: string | null;
  previewUrl: string | null;
}

const SITE_CONFIG_QUERY = `query PublicSiteConfig($workspaceSlug: String!) {
  publicSiteConfig(workspaceSlug: $workspaceSlug) {
    id
    workspaceId
    siteName
    defaultLanguage
    enabledLanguages
    enabledFeatures
    notFoundPageId
    previewUrl
  }
}`;

export async function fetchSiteConfig(
  config: CmssyClientConfig,
  options: GraphqlRequestOptions = {},
): Promise<CmssySiteConfig | null> {
  const data = await graphqlRequest<{
    publicSiteConfig?: CmssySiteConfig | null;
  }>(
    config,
    SITE_CONFIG_QUERY,
    { workspaceSlug: config.workspaceSlug },
    options,
    "site config query",
  );
  return data.publicSiteConfig ?? null;
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
