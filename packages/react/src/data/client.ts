import type { CmssyClientConfig } from "../content/content-client";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { resolveWorkspaceId as resolveWorkspaceIdFromConfig } from "./settings-client";

export interface QueryScopedOptions extends GraphqlRequestOptions {
  workspaceId?: string;
}

export interface CmssyClient {
  readonly config: CmssyClientConfig;
  query<T = unknown>(
    document: string,
    variables?: Record<string, unknown>,
    options?: GraphqlRequestOptions,
  ): Promise<T>;
  queryScoped<T = unknown>(
    document: string,
    variables?: Record<string, unknown>,
    options?: QueryScopedOptions,
  ): Promise<T>;
  resolveWorkspaceId(options?: GraphqlRequestOptions): Promise<string>;
}

export function createCmssyClient(config: CmssyClientConfig): CmssyClient {
  let cachedWorkspaceId: string | undefined;

  async function resolveWorkspaceId(
    options?: GraphqlRequestOptions,
  ): Promise<string> {
    if (cachedWorkspaceId) return cachedWorkspaceId;
    cachedWorkspaceId = await resolveWorkspaceIdFromConfig(config, options);
    return cachedWorkspaceId;
  }

  return {
    config,
    resolveWorkspaceId,
    query<T = unknown>(
      document: string,
      variables: Record<string, unknown> = {},
      options?: GraphqlRequestOptions,
    ): Promise<T> {
      return graphqlRequest<T>(config, document, variables, options, "query");
    },
    async queryScoped<T = unknown>(
      document: string,
      variables: Record<string, unknown> = {},
      options: QueryScopedOptions = {},
    ): Promise<T> {
      const { workspaceId: provided, headers, ...rest } = options;
      const workspaceId = provided ?? (await resolveWorkspaceId(rest));
      const scopedVariables =
        /\$workspaceId\b/.test(document) && !("workspaceId" in variables)
          ? { ...variables, workspaceId }
          : variables;
      return graphqlRequest<T>(
        config,
        document,
        scopedVariables,
        { ...rest, headers: { ...headers, "x-workspace-id": workspaceId } },
        "query",
      );
    },
  };
}
