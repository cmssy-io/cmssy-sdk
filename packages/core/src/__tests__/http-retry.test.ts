import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CmssyRequestError,
  CMSSY_RATE_LIMIT_WINDOW_MS,
  postGraphql,
} from "../data/http";
import { graphqlRequest } from "../data/graphql-request";
import type { FetchLikeResponse } from "../content/content-client";

const URL_ = "https://api.cmssy.io/graphql";

function res(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): FetchLikeResponse {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
  };
}

const OK_BODY = { data: { ping: true } };

describe("postGraphql retry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a 429 and resolves on the next attempt", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, { errors: [{ message: "rate" }] }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const data = await postGraphql<typeof OK_BODY.data>(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: { baseDelayMs: 1 },
        label: "test",
      },
    );
    expect(data).toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("waits exactly as long as the server asked, when that is short", async () => {
    const started = Date.now();
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "0" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    await postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: { baseDelayMs: 1 },
        label: "test",
      },
    );
    expect(Date.now() - started).toBeLessThan(500);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("stops immediately when the server asks for longer than we will wait", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(res(429, {}, { "Retry-After": "600" }));

    const err = await postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: { baseDelayMs: 1 },
        label: "page fetch",
      },
    ).catch((e: unknown) => e);

    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(CmssyRequestError);
    expect((err as CmssyRequestError).retryAfterMs).toBe(600_000);
    expect((err as Error).message).toContain("retry after 600s");
  });

  it("keeps retrying a long Retry-After when the caller says it may wait", async () => {
    vi.useFakeTimers();
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "120" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: { maxRetryAfterMs: 300_000 },
        label: "test",
      },
    );
    await vi.advanceTimersByTimeAsync(119_000);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 that asks for 27s, inside the rate-limit window (CMS-1446)", async () => {
    vi.useFakeTimers();
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "27" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: {}, label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(26_000);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("still retries a Retry-After of exactly 60s", async () => {
    vi.useFakeTimers();
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "60" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: {}, label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(59_000);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("surrenders on a Retry-After of 61s, one second past the window", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(res(429, {}, { "Retry-After": "61" }));

    const err = await postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: {}, label: "page fetch" },
    ).catch((e: unknown) => e);

    expect(doFetch).toHaveBeenCalledTimes(1);
    expect((err as CmssyRequestError).retryAfterMs).toBe(61_000);
  });

  it("reads a Retry-After given as an HTTP date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(
        res(429, {}, { "Retry-After": "Thu, 01 Jan 2026 00:00:30 GMT" }),
      )
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: {}, label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(29_000);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("publishes the rate-limit window the backend enforces", () => {
    expect(CMSSY_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it("gives up after maxRetries and throws a CmssyRequestError with the status", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(429, {}));

    const err = await postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: { maxRetries: 2, baseDelayMs: 1 },
        label: "test",
      },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CmssyRequestError);
    expect((err as CmssyRequestError).status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable statuses", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(500, {}));

    const err = await postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: { baseDelayMs: 1 },
        label: "test",
      },
    ).catch((e: unknown) => e);

    expect((err as CmssyRequestError).status).toBe(500);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry at all when retry is off (mutation default)", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(429, {}));

    const err = await graphqlRequest(
      { apiUrl: URL_, org: "acme", workspaceSlug: "pilot" },
      "mutation { x }",
      {},
      { fetch: doFetch },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CmssyRequestError);
    expect((err as CmssyRequestError).status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects during backoff when the signal aborts", async () => {
    const controller = new AbortController();
    const doFetch = vi
      .fn()
      .mockResolvedValue(res(429, {}, { "Retry-After": "2" }));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        signal: controller.signal,
        retry: { maxDelayMs: 5_000 },
        label: "test",
      },
    );
    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toThrow(/aborted/);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("works without a headers accessor on the response (backoff fallback)", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      })
      .mockResolvedValueOnce(res(200, OK_BODY));

    const data = await postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: { baseDelayMs: 1 },
        label: "test",
      },
    );
    expect(data).toEqual(OK_BODY.data);
  });
});
