import {
  resolveApiUrl,
  resolvePublicUrl,
  type CmssyClientConfig,
  type FetchLike,
} from "../content/content-client";
import { postGraphql, type RetryOption } from "./http";

export interface GraphqlRequestOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  public?: boolean;
  retry?: RetryOption;
}

export async function graphqlRequest<T>(
  config: CmssyClientConfig,
  query: string,
  variables: Record<string, unknown>,
  options: GraphqlRequestOptions = {},
  label = "request",
): Promise<T> {
  const url = options.public
    ? resolvePublicUrl(config)
    : resolveApiUrl(config.apiUrl);
  return postGraphql<T>(url, query, variables, {
    fetch: options.fetch,
    signal: options.signal,
    headers: options.headers,
    retry: options.retry,
    label,
  });
}
