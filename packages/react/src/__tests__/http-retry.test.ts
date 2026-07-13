import { describe, expect, it, vi } from "vitest";
import { CmssyRequestError, postGraphql } from "../data/http";
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
  it("retries a 429 and resolves on the next attempt", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, { errors: [{ message: "rate" }] }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const data = await postGraphql<typeof OK_BODY.data>(URL_, "q", {}, {
      fetch: doFetch,
      retry: { baseDelayMs: 1 },
      label: "test",
    });
    expect(data).toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After seconds (capped by maxDelayMs)", async () => {
    const started = Date.now();
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "600" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    await postGraphql(URL_, "q", {}, {
      fetch: doFetch,
      retry: { maxDelayMs: 20, baseDelayMs: 1 },
      label: "test",
    });
    expect(Date.now() - started).toBeLessThan(500);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries and throws a CmssyRequestError with the status", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(429, {}));

    const err = await postGraphql(URL_, "q", {}, {
      fetch: doFetch,
      retry: { maxRetries: 2, baseDelayMs: 1 },
      label: "test",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CmssyRequestError);
    expect((err as CmssyRequestError).status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable statuses", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(500, {}));

    const err = await postGraphql(URL_, "q", {}, {
      fetch: doFetch,
      retry: { baseDelayMs: 1 },
      label: "test",
    }).catch((e: unknown) => e);

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

    const pending = postGraphql(URL_, "q", {}, {
      fetch: doFetch,
      signal: controller.signal,
      retry: { maxDelayMs: 5_000 },
      label: "test",
    });
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

    const data = await postGraphql(URL_, "q", {}, {
      fetch: doFetch,
      retry: { baseDelayMs: 1 },
      label: "test",
    });
    expect(data).toEqual(OK_BODY.data);
  });
});
