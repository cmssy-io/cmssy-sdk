import {
  resolveApiUrl,
  resolvePublicUrl,
  type CmssyClientConfig,
  type FetchLike,
} from "../content/content-client";
import { documentText, type CmssyOperationInput } from "./document";
import { postGraphql, type RetryOption } from "./http";

export interface GraphqlRequestOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  public?: boolean;
  retry?: RetryOption;
}

export async function graphqlRequest<
  Result = unknown,
  Variables = Record<string, unknown>,
>(
  config: CmssyClientConfig,
  query: CmssyOperationInput<Result, Variables>,
  variables: Variables,
  options: GraphqlRequestOptions = {},
  label = "request",
): Promise<Result> {
  const url = options.public
    ? resolvePublicUrl(config)
    : resolveApiUrl(config.apiUrl);
  const text = documentText(query);
  return postGraphql<Result, Variables>(
    url,
    text,
    withConfigChannel(config, text, variables),
    {
      fetch: options.fetch,
      signal: options.signal,
      headers: options.headers,
      retry: options.retry,
      label,
    },
  );
}

function withConfigChannel<Variables>(
  config: CmssyClientConfig,
  document: string,
  variables: Variables,
): Variables {
  const channel = config.channel?.trim();
  if (!channel || !/\$channel\b/.test(document)) return variables;
  const current = (variables ?? {}) as Record<string, unknown>;
  if (current.channel !== undefined) return variables;
  return { ...current, channel } as Variables;
}
