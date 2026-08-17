import type { FetchLike, FetchLikeResponse } from "../content/content-client";

export class CmssyRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;
  readonly waitedMs?: number;

  constructor(
    message: string,
    status: number,
    retryAfterMs?: number,
    waitedMs?: number,
  ) {
    super(message);
    this.name = "CmssyRequestError";
    this.status = status;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
    if (waitedMs !== undefined) this.waitedMs = waitedMs;
  }
}

export interface RetryPolicy {
  maxRetries?: number;
  baseDelayMs?: number;
  throttleBaseDelayMs?: number;
  maxDelayMs?: number;
  maxRetryAfterMs?: number;
  maxTotalWaitMs?: number;
  retryStatuses?: number[];
}

export type CmssyRetryMode = "build" | "interactive";

export type RetryOption = CmssyRetryMode | RetryPolicy | false;

const THROTTLE_STATUS = 429;

export const CMSSY_RATE_LIMIT_WINDOW_MS = 60_000;

type ResolvedRetryPolicy = Required<RetryPolicy>;

export const CMSSY_RETRY_MODES: Record<CmssyRetryMode, ResolvedRetryPolicy> = {
  build: {
    maxRetries: 4,
    baseDelayMs: 300,
    throttleBaseDelayMs: 1_000,
    maxDelayMs: 20_000,
    maxRetryAfterMs: CMSSY_RATE_LIMIT_WINDOW_MS,
    maxTotalWaitMs: 180_000,
    retryStatuses: [429, 503],
  },
  interactive: {
    maxRetries: 2,
    baseDelayMs: 50,
    throttleBaseDelayMs: 500,
    maxDelayMs: 1_000,
    maxRetryAfterMs: 1_000,
    maxTotalWaitMs: 2_000,
    retryStatuses: [429, 503],
  },
};

export function resolveRetryPolicy(
  retry: RetryOption | undefined,
): ResolvedRetryPolicy | null {
  if (retry === false || retry === undefined) return null;
  if (typeof retry === "string") return CMSSY_RETRY_MODES[retry];
  const base = CMSSY_RETRY_MODES.build;
  return {
    maxRetries: retry.maxRetries ?? base.maxRetries,
    baseDelayMs: retry.baseDelayMs ?? base.baseDelayMs,
    throttleBaseDelayMs: retry.throttleBaseDelayMs ?? base.throttleBaseDelayMs,
    maxDelayMs: retry.maxDelayMs ?? base.maxDelayMs,
    maxRetryAfterMs: retry.maxRetryAfterMs ?? base.maxRetryAfterMs,
    maxTotalWaitMs: retry.maxTotalWaitMs ?? base.maxTotalWaitMs,
    retryStatuses: retry.retryStatuses ?? base.retryStatuses,
  };
}

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

interface RetriedResponse {
  response: FetchLikeResponse;
  waitedMs: number;
}

async function fetchWithRetry(
  doFetch: FetchLike,
  url: string,
  init: Parameters<FetchLike>[1],
  retry: RetryOption | undefined,
  label: string,
): Promise<RetriedResponse> {
  const policy = resolveRetryPolicy(retry);
  if (policy === null) {
    return { response: await doFetch(url, init), waitedMs: 0 };
  }

  let response = await doFetch(url, init);
  let waitedMs = 0;
  for (let attempt = 0; attempt < policy.maxRetries; attempt++) {
    if (response.ok || !policy.retryStatuses.includes(response.status)) {
      return { response, waitedMs };
    }
    const throttled = response.status === THROTTLE_STATUS;
    const asked = retryAfterMs(response);
    if (asked !== null && asked > policy.maxRetryAfterMs) {
      return { response, waitedMs };
    }
    const base = throttled ? policy.throttleBaseDelayMs : policy.baseDelayMs;
    const wait =
      asked !== null
        ? asked + Math.random() * policy.throttleBaseDelayMs
        : Math.random() * Math.min(base * 2 ** attempt, policy.maxDelayMs);
    if (waitedMs + wait > policy.maxTotalWaitMs) {
      return { response, waitedMs };
    }
    console.warn(
      `[cmssy] ${label} got ${response.status}, retrying in ${Math.round(wait)}ms (attempt ${attempt + 1}/${policy.maxRetries})`,
    );
    await sleep(wait, init.signal);
    waitedMs += wait;
    response = await doFetch(url, init);
  }
  return { response, waitedMs };
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

export interface PostGraphqlOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  retry?: RetryOption;
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

  const { response, waitedMs } = await fetchWithRetry(
    doFetch,
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ query, variables }),
      signal: options.signal,
    },
    options.retry,
    options.label,
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
    const spent =
      waitedMs > 0 ? ` - gave up after waiting ${Math.round(waitedMs)}ms` : "";
    throw new CmssyRequestError(
      `cmssy: ${options.label} failed (${response.status})${detail}${wait}${spent}`,
      response.status,
      asked ?? undefined,
      waitedMs > 0 ? waitedMs : undefined,
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
