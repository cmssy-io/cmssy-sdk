import {
  resolveApiUrl,
  resolvePublicUrl,
  type CmssyClientConfig,
  type FetchLike,
} from "../content/content-client";
import type { CmssyOperationInput } from "./document";
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
  return postGraphql<Result, Variables>(url, query, variables, {
    fetch: options.fetch,
    signal: options.signal,
    headers: options.headers,
    retry: options.retry,
    label,
  });
}
