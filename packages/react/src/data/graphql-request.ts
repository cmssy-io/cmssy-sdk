import type { CmssyClientConfig, FetchLike } from "../content/content-client";

export interface GraphqlRequestOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function graphqlRequest<T>(
  config: CmssyClientConfig,
  query: string,
  variables: Record<string, unknown>,
  options: GraphqlRequestOptions = {},
  label = "request",
): Promise<T> {
  const doFetch =
    options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    throw new Error(
      "cmssy: no fetch implementation available - pass options.fetch",
    );
  }

  const response = await doFetch(config.apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...options.headers },
    body: JSON.stringify({ query, variables }),
    signal: options.signal,
  });

  type GraphqlResponse = {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as GraphqlResponse;
      if (body.errors && body.errors.length > 0) {
        detail = ` - ${body.errors
          .map((error) => error.message ?? "GraphQL error")
          .join("; ")}`;
      }
    } catch {
      detail = "";
    }
    throw new Error(`cmssy: ${label} failed (${response.status})${detail}`);
  }

  let json: GraphqlResponse;
  try {
    json = (await response.json()) as GraphqlResponse;
  } catch {
    throw new Error(`cmssy: invalid JSON response from the ${label}`);
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new Error(`cmssy: ${label} error - ${message}`);
  }
  return json.data as T;
}
