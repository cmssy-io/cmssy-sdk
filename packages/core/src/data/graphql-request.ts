import {
  resolveApiUrl,
  resolvePublicUrl,
  type CmssyClientConfig,
  type FetchLike,
} from "../content/content-client";
import { postGraphql, type RetryPolicy } from "./http";

export interface GraphqlRequestOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * Route through the org-scoped public delivery path instead of the base
   * `/graphql` endpoint. Set for unauthenticated public queries so the backend
   * resolves the workspace from the URL rather than a global slug lookup.
   */
  public?: boolean;
  /**
   * Retry transient HTTP failures (429/503, honoring Retry-After). Off by
   * default: this function also carries mutations (auth, cart, checkout),
   * which must never be blind-retried. Read-only callers opt in with `{}`.
   */
  retry?: RetryPolicy | false;
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
