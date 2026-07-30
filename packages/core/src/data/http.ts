import type { FetchLike, FetchLikeResponse } from "../content/content-client";

export class CmssyRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = "CmssyRequestError";
    this.status = status;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export interface RetryPolicy {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxRetryAfterMs?: number;
  retryStatuses?: number[];
}

const DEFAULT_RETRY_STATUSES = [429, 503];

function retryAfterMs(response: FetchLikeResponse): number | null {
  const raw = response.headers?.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("cmssy: request aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new Error("cmssy: request aborted"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithRetry(
  doFetch: FetchLike,
  url: string,
  init: Parameters<FetchLike>[1],
  retry: RetryPolicy | false | undefined,
): Promise<FetchLikeResponse> {
  if (retry === false || retry === undefined) {
    return doFetch(url, init);
  }
  const maxRetries = retry.maxRetries ?? 3;
  const baseDelayMs = retry.baseDelayMs ?? 300;
  const maxDelayMs = retry.maxDelayMs ?? 3_000;
  const maxRetryAfterMs = retry.maxRetryAfterMs ?? 10_000;
  const retryStatuses = retry.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  let response = await doFetch(url, init);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (response.ok || !retryStatuses.includes(response.status)) {
      return response;
    }
    const asked = retryAfterMs(response);
    if (asked !== null && asked > maxRetryAfterMs) return response;
    const backoff = baseDelayMs * 2 ** attempt;
    const wait = asked !== null ? asked : Math.min(backoff, maxDelayMs);
    await sleep(wait, init.signal);
    response = await doFetch(url, init);
  }
  return response;
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

export interface PostGraphqlOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  retry?: RetryPolicy | false;
  label: string;
}

export async function postGraphql<T>(
  url: string,
  query: string,
  variables: Record<string, unknown>,
  options: PostGraphqlOptions,
): Promise<T> {
  const doFetch =
    options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    throw new Error(
      "cmssy: no fetch implementation available - pass options.fetch",
    );
  }

  const response = await fetchWithRetry(
    doFetch,
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ query, variables }),
      signal: options.signal,
    },
    options.retry,
  );

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as GraphqlEnvelope<T>;
      if (body.errors && body.errors.length > 0) {
        detail = ` - ${body.errors
          .map((error) => error.message ?? "GraphQL error")
          .join("; ")}`;
      }
    } catch {
      detail = "";
    }
    const asked = retryAfterMs(response);
    const wait =
      asked !== null ? ` - retry after ${Math.ceil(asked / 1000)}s` : "";
    throw new CmssyRequestError(
      `cmssy: ${options.label} failed (${response.status})${detail}${wait}`,
      response.status,
      asked ?? undefined,
    );
  }

  let json: GraphqlEnvelope<T>;
  try {
    json = (await response.json()) as GraphqlEnvelope<T>;
  } catch {
    throw new Error(`cmssy: invalid JSON response from the ${options.label}`);
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new Error(`cmssy: ${options.label} error - ${message}`);
  }
  return json.data as T;
}
