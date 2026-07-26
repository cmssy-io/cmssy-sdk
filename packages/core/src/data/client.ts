import {
  resolveApiUrl,
  type CmssyClientConfig,
} from "../content/content-client";
import { documentText, type CmssyTypedDocument } from "./document";
import { graphqlRequest, type GraphqlRequestOptions } from "./graphql-request";
import { resolveWorkspaceId as resolveWorkspaceIdFromConfig } from "./settings-client";

export interface QueryScopedOptions extends GraphqlRequestOptions {
  workspaceId?: string;
}

export interface CmssyClient {
  readonly config: CmssyClientConfig;
  /**
   * Hand it a document that carries its types (what graphql-codegen emits, in
   * either mode) and the variables are checked and the result inferred; hand it
   * a query string and it behaves exactly as before. Same method, no second
   * way to do the same thing.
   */
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
  /** {@link CmssyClient.query} with the workspace id resolved and injected. */
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
  // Fill the platform default for apiUrl so the client, its cache keys, and the
  // workspace-id resolver all see a concrete endpoint - consumers on cmssy cloud
  // never set it.
  const config: CmssyClientConfig = {
    ...input,
    apiUrl: resolveApiUrl(input.apiUrl),
  };
  let cachedWorkspaceId: string | undefined;
  let inFlight: Promise<string> | undefined;

  function resolveWorkspaceId(
    options?: GraphqlRequestOptions,
  ): Promise<string> {
    if (cachedWorkspaceId) return Promise.resolve(cachedWorkspaceId);
    if (!inFlight) {
      inFlight = resolveWorkspaceIdFromConfig(config, options)
        .then((id) => {
          cachedWorkspaceId = id;
          return id;
        })
        .finally(() => {
          inFlight = undefined;
        });
    }
    return inFlight;
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
      { ...rest, headers: { ...headers, "x-workspace-id": workspaceId } },
      "graphql operation",
    );
  }

  const client: CmssyClient = {
    config,
    resolveWorkspaceId,
    // One implementation behind both overloads: a string passes through
    // documentText untouched, a typed document gives up its query text.
    query: ((
      document: unknown,
      variables: Record<string, unknown> = {},
      options?: GraphqlRequestOptions,
    ) =>
      query(documentText(document), variables, options)) as CmssyClient["query"],
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
