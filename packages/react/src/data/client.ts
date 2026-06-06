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
  let inFlight: Promise<string> | undefined;

  function resolveWorkspaceId(
    options?: GraphqlRequestOptions,
  ): Promise<string> {
    if (cachedWorkspaceId) return Promise.resolve(cachedWorkspaceId);
    if (!inFlight) {
      inFlight = resolveWorkspaceIdFromConfig(config, options).then((id) => {
        cachedWorkspaceId = id;
        return id;
      });
      inFlight.catch(() => {
        inFlight = undefined;
      });
    }
    return inFlight;
  }

  return {
    config,
    resolveWorkspaceId,
    query<T = unknown>(
      document: string,
      variables: Record<string, unknown> = {},
      options?: GraphqlRequestOptions,
    ): Promise<T> {
      return graphqlRequest<T>(
        config,
        document,
        variables,
        options,
        "graphql operation",
      );
    },
    async queryScoped<T = unknown>(
      document: string,
      variables: Record<string, unknown> = {},
      options: QueryScopedOptions = {},
    ): Promise<T> {
      const { workspaceId: provided, headers, ...rest } = options;
      const workspaceId =
        provided ?? (await resolveWorkspaceId({ ...rest, headers }));
      const scopedVariables =
        /\$workspaceId\b/.test(document) && !("workspaceId" in variables)
          ? { ...variables, workspaceId }
          : variables;
      return graphqlRequest<T>(
        config,
        document,
        scopedVariables,
        { ...rest, headers: { ...headers, "x-workspace-id": workspaceId } },
        "graphql operation",
      );
    },
  };
}
