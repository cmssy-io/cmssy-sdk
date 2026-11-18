import type { FetchLike, FetchLikeResponse } from "../content/content-client";
import { CMSSY_USER_AGENT } from "../version";
import { documentText, type CmssyOperationInput } from "./document";

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
  retryStatuses?: readonly number[];
  paceBelowRemaining?: number;
}

export type CmssyRetryMode = "build" | "interactive";

export type RetryOption = CmssyRetryMode | RetryPolicy | false;

const THROTTLE_STATUS = 429;

export const CMSSY_RATE_LIMIT_WINDOW_MS = 60_000;

type ResolvedRetryPolicy = Readonly<Required<RetryPolicy>>;

export const CMSSY_RETRY_MODES: Record<CmssyRetryMode, ResolvedRetryPolicy> = {
  build: {
    maxRetries: 4,
    baseDelayMs: 300,
    throttleBaseDelayMs: 1_000,
    maxDelayMs: 20_000,
    maxRetryAfterMs: CMSSY_RATE_LIMIT_WINDOW_MS,
    maxTotalWaitMs: 180_000,
    retryStatuses: Object.freeze([429, 503]),
    paceBelowRemaining: 6,
  },
  interactive: {
    maxRetries: 2,
    baseDelayMs: 50,
    throttleBaseDelayMs: 500,
    maxDelayMs: 1_000,
    maxRetryAfterMs: 1_000,
    maxTotalWaitMs: 2_000,
    retryStatuses: Object.freeze([429, 503]),
    paceBelowRemaining: 0,
  },
};

Object.freeze(CMSSY_RETRY_MODES.build);
Object.freeze(CMSSY_RETRY_MODES.interactive);
Object.freeze(CMSSY_RETRY_MODES);

export function isTransientRequestError(
  error: unknown,
): error is CmssyRequestError {
  return (
    error instanceof CmssyRequestError &&
    CMSSY_RETRY_MODES.build.retryStatuses.includes(error.status)
  );
}

export function resolveRetryPolicy(
  retry: RetryOption | undefined,
): ResolvedRetryPolicy | null {
  if (retry === false || retry === undefined) return null;
  if (typeof retry === "string") {
    const mode = CMSSY_RETRY_MODES[retry];
    if (!mode) {
      throw new Error(
        `cmssy: unknown retry mode "${retry}" - use ${Object.keys(
          CMSSY_RETRY_MODES,
        )
          .map((name) => `"${name}"`)
          .join(" or ")}, false, or a retry policy object`,
      );
    }
    return mode;
  }
  const base = CMSSY_RETRY_MODES.build;
  return {
    maxRetries: retry.maxRetries ?? base.maxRetries,
    baseDelayMs: retry.baseDelayMs ?? base.baseDelayMs,
    throttleBaseDelayMs: retry.throttleBaseDelayMs ?? base.throttleBaseDelayMs,
    maxDelayMs: retry.maxDelayMs ?? base.maxDelayMs,
    maxRetryAfterMs: retry.maxRetryAfterMs ?? base.maxRetryAfterMs,
    maxTotalWaitMs: retry.maxTotalWaitMs ?? base.maxTotalWaitMs,
    retryStatuses: retry.retryStatuses ?? base.retryStatuses,
    paceBelowRemaining: retry.paceBelowRemaining ?? base.paceBelowRemaining,
  };
}

const buildThrottle = new Map<string, number>();

export function resetCmssyBuildThrottle(): void {
  buildThrottle.clear();
}

function pacedBy(policy: ResolvedRetryPolicy): boolean {
  return policy.paceBelowRemaining > 0;
}

function holdEndpoint(url: string, until: number): void {
  if (until > (buildThrottle.get(url) ?? 0)) buildThrottle.set(url, until);
}

function heldFor(url: string): number {
  const until = buildThrottle.get(url);
  if (until === undefined) return 0;
  const left = until - Date.now();
  if (left <= 0) {
    buildThrottle.delete(url);
    return 0;
  }
  return left;
}

function lowRemainingResetAt(
  response: FetchLikeResponse,
  threshold: number,
): number | null {
  const remainingRaw = response.headers?.get("x-ratelimit-remaining");
  const resetRaw = response.headers?.get("x-ratelimit-reset");
  if (!remainingRaw || !resetRaw) return null;
  const remaining = Number(remainingRaw);
  const reset = Number(resetRaw);
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return null;
  return remaining <= threshold ? reset * 1000 : null;
}

function observeRateLimit(
  url: string,
  response: FetchLikeResponse,
  policy: ResolvedRetryPolicy,
): void {
  const jitter = Math.random() * policy.throttleBaseDelayMs;
  if (response.status === THROTTLE_STATUS) {
    const asked = retryAfterMs(response);
    if (asked !== null && asked <= policy.maxRetryAfterMs) {
      holdEndpoint(url, Date.now() + asked + jitter);
    }
    return;
  }
  if (!response.ok) return;
  const resetAt = lowRemainingResetAt(response, policy.paceBelowRemaining);
  if (resetAt === null) return;
  const until = Math.min(resetAt, Date.now() + policy.maxRetryAfterMs);
  if (until > Date.now()) holdEndpoint(url, until + jitter);
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

  const paced = pacedBy(policy);
  let waitedMs = 0;
  const send = async (): Promise<FetchLikeResponse> => {
    if (paced) {
      const hold = Math.round(heldFor(url));
      if (hold > 0) {
        await sleep(hold, init?.signal);
        waitedMs += hold;
      }
    }
    const sent = await doFetch(url, init);
    if (paced) observeRateLimit(url, sent, policy);
    return sent;
  };

  let response = await send();
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
    const wait = Math.round(
      asked !== null
        ? Math.min(
            asked + Math.random() * policy.throttleBaseDelayMs,
            policy.maxRetryAfterMs,
          )
        : Math.random() * Math.min(base * 2 ** attempt, policy.maxDelayMs),
    );
    if (waitedMs + wait > policy.maxTotalWaitMs) {
      return { response, waitedMs };
    }
    console.warn(
      `[cmssy] ${label} got ${response.status}, retrying in ${wait}ms (attempt ${attempt + 1}/${policy.maxRetries})`,
    );
    await sleep(wait, init?.signal);
    waitedMs += wait;
    response = await send();
  }
  return { response, waitedMs };
}

export function createRetryingFetch<F extends FetchLike = FetchLike>(
  retry: RetryOption,
  doFetch?: F,
  label = "request",
): F {
  const wrapped: FetchLike = async (url, init) => {
    const impl =
      doFetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (typeof impl !== "function") {
      throw new Error("cmssy: no fetch implementation available - pass one");
    }
    return (await fetchWithRetry(impl, url, init, retry, label)).response;
  };
  return wrapped as F;
}

export interface CmssyGraphqlErrorEntry {
  message?: string;
  extensions?: { code?: string; reason?: string; [key: string]: unknown };
}

export class CmssyGraphqlError extends Error {
  readonly errors: ReadonlyArray<CmssyGraphqlErrorEntry>;
  readonly code: string | undefined;
  readonly reason: string | undefined;

  constructor(message: string, errors: ReadonlyArray<CmssyGraphqlErrorEntry>) {
    super(message);
    this.name = "CmssyGraphqlError";
    this.errors = errors;
    this.code = errors[0]?.extensions?.code;
    this.reason = errors[0]?.extensions?.reason;
  }
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: CmssyGraphqlErrorEntry[];
}

export interface PostGraphqlOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  retry?: RetryOption;
  label: string;
}

export async function postGraphql<
  Result = unknown,
  Variables = Record<string, unknown>,
>(
  url: string,
  query: CmssyOperationInput<Result, Variables>,
  variables: Variables,
  options: PostGraphqlOptions,
): Promise<Result> {
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
      headers: {
        "content-type": "application/json",
        "user-agent": CMSSY_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify({ query: documentText(query), variables }),
      signal: options.signal,
    },
    options.retry,
    options.label,
  );

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as GraphqlEnvelope<Result>;
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
    const spent = waitedMs > 0 ? ` - gave up after waiting ${waitedMs}ms` : "";
    throw new CmssyRequestError(
      `cmssy: ${options.label} failed (${response.status})${detail}${wait}${spent}`,
      response.status,
      asked ?? undefined,
      waitedMs > 0 ? waitedMs : undefined,
    );
  }

  let json: GraphqlEnvelope<Result>;
  try {
    json = (await response.json()) as GraphqlEnvelope<Result>;
  } catch {
    throw new Error(`cmssy: invalid JSON response from the ${options.label}`);
  }
  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message ?? "GraphQL error")
      .join("; ");
    throw new CmssyGraphqlError(
      `cmssy: ${options.label} error - ${message}`,
      json.errors,
    );
  }
  return json.data as Result;
}
