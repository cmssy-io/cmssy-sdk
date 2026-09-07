import {
  resolveApiUrl,
  type CmssyClientConfig,
} from "../content/content-client";
import { documentText, type CmssyTypedDocument } from "./document";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { cachedWorkspaceId } from "./settings-client";

export interface QueryScopedOptions extends Omit<
  GraphqlRequestOptions,
  "public"
> {
  workspaceId?: string;
}

export interface CmssyClient {
  readonly config: CmssyClientConfig;
  query<Result, Variables>(
    document: CmssyTypedDocument<Result, Variables>,
    variables: Variables,
    options?: GraphqlRequestOptions,
  ): Promise<Result>;
  query<T = unknown>(
    document: string,
    variables?: Record<string, unknown>,
    options?: GraphqlRequestOptions,
  ): Promise<T>;
  queryScoped<Result, Variables>(
    document: CmssyTypedDocument<Result, Variables>,
    variables: Omit<Variables, "workspaceId">,
    options?: QueryScopedOptions,
  ): Promise<Result>;
  queryScoped<T = unknown>(
    document: string,
    variables?: Record<string, unknown>,
    options?: QueryScopedOptions,
  ): Promise<T>;
  resolveWorkspaceId(options?: GraphqlRequestOptions): Promise<string>;
}

export function createCmssyClient(input: CmssyClientConfig): CmssyClient {
  const config: CmssyClientConfig = {
    ...input,
    apiUrl: resolveApiUrl(input.apiUrl),
  };
  function resolveWorkspaceId(
    options?: GraphqlRequestOptions,
  ): Promise<string> {
    return cachedWorkspaceId(config, options);
  }

  function query<T>(
    document: string,
    variables: Record<string, unknown>,
    options?: GraphqlRequestOptions,
  ): Promise<T> {
    return graphqlRequest<T>(
      config,
      document,
      variables,
      options,
      "graphql operation",
    );
  }

  async function queryScoped<T>(
    document: string,
    variables: Record<string, unknown>,
    options: QueryScopedOptions = {},
  ): Promise<T> {
    const { workspaceId: provided, headers, ...rest } = options;
    const workspaceId =
      provided ?? (await resolveWorkspaceId({ ...rest, headers }));
    const hasWorkspaceId =
      variables.workspaceId !== undefined && variables.workspaceId !== null;
    const scopedVariables =
      /\$workspaceId\b/.test(document) && !hasWorkspaceId
        ? { ...variables, workspaceId }
        : variables;
    return graphqlRequest<T>(
      config,
      document,
      scopedVariables,
      {
        ...rest,
        public: true,
        headers: { ...headers, "x-workspace-id": workspaceId },
      },
      "graphql operation",
    );
  }

  const client: CmssyClient = {
    config,
    resolveWorkspaceId,
    query: ((
      document: unknown,
      variables: Record<string, unknown> = {},
      options?: GraphqlRequestOptions,
    ) =>
      query(
        documentText(document),
        variables,
        options,
      )) as CmssyClient["query"],
    queryScoped: ((
      document: unknown,
      variables: Record<string, unknown> = {},
      options: QueryScopedOptions = {},
    ) =>
      queryScoped(
        documentText(document),
        variables,
        options,
      )) as CmssyClient["queryScoped"],
  };

  return client;
}
