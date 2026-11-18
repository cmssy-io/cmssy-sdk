import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CmssyGraphqlError,
  CmssyRequestError,
  CMSSY_RATE_LIMIT_WINDOW_MS,
  CMSSY_RETRY_MODES,
  isTransientRequestError,
  createRetryingFetch,
  postGraphql,
  resetCmssyBuildThrottle,
} from "../data/http";
import { graphqlRequest } from "../data/graphql-request";
import { CMSSY_CORE_VERSION } from "../version";
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

afterEach(() => {
  resetCmssyBuildThrottle();
});

describe("postGraphql headers", () => {
  it("identifies the SDK with a user-agent the platform can recognise", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(200, OK_BODY));
    await postGraphql(URL_, "q", {}, { fetch: doFetch, label: "test" });
    const init = doFetch.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["user-agent"]).toBe(`@cmssy/core/${CMSSY_CORE_VERSION}`);
    expect(init.headers["user-agent"]).toMatch(/^@cmssy\//);
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("lets a caller header win over the defaults", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(200, OK_BODY));
    await postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, label: "test", headers: { "user-agent": "mine/1" } },
    );
    const init = doFetch.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["user-agent"]).toBe("mine/1");
  });
});

describe("postGraphql retry", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

describe("retry modes (CMS-1463)", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits out a 45s Retry-After in build mode", async () => {
    vi.useFakeTimers();
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "45" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "build", label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(44_000);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("surrenders on the same 45s Retry-After in interactive mode", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(res(429, {}, { "Retry-After": "45" }));

    const err = await postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "interactive", label: "page fetch" },
    ).catch((e: unknown) => e);

    expect(doFetch).toHaveBeenCalledTimes(1);
    expect((err as CmssyRequestError).status).toBe(429);
    expect((err as CmssyRequestError).waitedMs).toBeUndefined();
  });

  it("stops on the total wait budget, not on maxRetries", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
    const doFetch = vi.fn().mockResolvedValue(res(429, {}));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: {
          maxRetries: 10,
          throttleBaseDelayMs: 1_000,
          maxDelayMs: 1_000,
          maxTotalWaitMs: 2_500,
        },
        label: "page fetch",
      },
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await pending;

    expect(doFetch).toHaveBeenCalledTimes(3);
    expect((err as CmssyRequestError).waitedMs).toBe(2_000);
    expect((err as Error).message).toContain("waiting 2000ms");
  });

  it("gives a 503 the transient base delay and a 429 the throttling one", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(1);
    const transient = vi
      .fn()
      .mockResolvedValueOnce(res(503, {}))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const first = postGraphql(
      URL_,
      "q",
      {},
      { fetch: transient, retry: "build", label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(299);
    expect(transient).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toEqual(OK_BODY.data);

    const throttled = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const second = postGraphql(
      URL_,
      "q",
      {},
      { fetch: throttled, retry: "build", label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(throttled).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toEqual(OK_BODY.data);
  });

  it("applies full jitter to the computed backoff", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "build", label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(249);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual(OK_BODY.data);
  });

  it("spreads a honoured Retry-After so parallel workers do not wake together", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "10" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "build", label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(10_499);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual(OK_BODY.data);
  });

  it("keeps the spread under maxRetryAfterMs, the ceiling it is documented as", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "1" }))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "interactive", label: "page fetch" },
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual(OK_BODY.data);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("names the retry in the log, so a slow build is diagnosable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, OK_BODY));

    await postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "build", label: "page fetch" },
    );

    expect(warn).toHaveBeenCalledWith(
      "[cmssy] page fetch got 429, retrying in 0ms (attempt 1/4)",
    );
  });

  it("rejects an unknown mode name with the valid ones spelled out", async () => {
    const doFetch = vi.fn().mockResolvedValue(res(200, OK_BODY));

    await expect(
      postGraphql(
        URL_,
        "q",
        {},
        {
          fetch: doFetch,
          retry: "agressive" as unknown as "build",
          label: "page fetch",
        },
      ),
    ).rejects.toThrow(
      'cmssy: unknown retry mode "agressive" - use "build" or "interactive", false, or a retry policy object',
    );
    expect(doFetch).not.toHaveBeenCalled();
  });

  it("sleeps a whole number of ms, so the budget matches real elapsed time", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1234567891);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, OK_BODY));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "build", label: "page fetch" },
    );

    await vi.advanceTimersByTimeAsync(122);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual(OK_BODY.data);
    expect(warn).toHaveBeenCalledWith(
      "[cmssy] page fetch got 429, retrying in 123ms (attempt 1/4)",
    );
  });

  it("reports an integer waitedMs on the error it gives up with", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1234567891);
    const doFetch = vi.fn().mockResolvedValue(res(429, {}));

    const pending = postGraphql(
      URL_,
      "q",
      {},
      { fetch: doFetch, retry: "build", label: "page fetch" },
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);

    const err = (await pending) as CmssyRequestError;
    expect(err.waitedMs).toBe(123 + 247 + 494 + 988);
    expect(err.message).toContain("gave up after waiting 1852ms");
  });

  it("cannot be reconfigured through the exported table", async () => {
    const mutable = CMSSY_RETRY_MODES.interactive as unknown as {
      maxRetries: number;
      retryStatuses: number[];
    };
    expect(() => {
      mutable.maxRetries = 99;
    }).toThrow(TypeError);
    expect(() => {
      mutable.retryStatuses.push(500);
    }).toThrow(TypeError);
    expect(CMSSY_RETRY_MODES.interactive.maxRetries).toBe(2);

    const doFetch = vi.fn().mockResolvedValue(res(500, {}));
    await postGraphql(
      URL_,
      "q",
      {},
      {
        fetch: doFetch,
        retry: "interactive",
        label: "page fetch",
      },
    ).catch(() => {});
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("publishes both modes, and the interactive ceiling is a second", () => {
    expect(CMSSY_RETRY_MODES.build.maxRetryAfterMs).toBe(60_000);
    expect(CMSSY_RETRY_MODES.build.maxTotalWaitMs).toBe(180_000);
    expect(CMSSY_RETRY_MODES.interactive.maxRetryAfterMs).toBe(1_000);
    expect(CMSSY_RETRY_MODES.interactive.maxTotalWaitMs).toBe(2_000);
    expect(CMSSY_RETRY_MODES.interactive.maxRetries).toBe(2);
  });
});

describe("what a caller may degrade on (CMS-2049)", () => {
  it("states the largest Retry-After each mode can honour", () => {
    expect({
      build: CMSSY_RETRY_MODES.build.maxRetryAfterMs,
      interactive: CMSSY_RETRY_MODES.interactive.maxRetryAfterMs,
    }).toEqual({ build: 60_000, interactive: 1_000 });
    expect(CMSSY_RETRY_MODES.build.maxRetryAfterMs).toBe(
      CMSSY_RATE_LIMIT_WINDOW_MS,
    );
  });

  it("calls a failure transient exactly when the build policy would have retried it", () => {
    for (const status of [429, 503]) {
      expect(CMSSY_RETRY_MODES.build.retryStatuses).toContain(status);
      expect(isTransientRequestError(new CmssyRequestError("x", status))).toBe(
        true,
      );
    }
    for (const status of [400, 401, 403, 404, 500, 502]) {
      expect(CMSSY_RETRY_MODES.build.retryStatuses).not.toContain(status);
      expect(isTransientRequestError(new CmssyRequestError("x", status))).toBe(
        false,
      );
    }
  });

  it("refuses anything that is not a cmssy request error", () => {
    expect(isTransientRequestError(new TypeError("fetch failed"))).toBe(false);
    expect(isTransientRequestError({ status: 429 })).toBe(false);
    expect(isTransientRequestError(null)).toBe(false);
  });
});

describe("createRetryingFetch", () => {
  const INIT = { method: "POST", headers: {}, body: "{}" };

  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a 429 on the caller's own fetch and hands back the attempt that succeeded", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(res(200, OK_BODY));
    const response = await createRetryingFetch("build", doFetch, "schema")(
      URL_,
      INIT,
    );
    expect(response.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(doFetch.mock.calls[1]).toEqual([URL_, INIT]);
  });

  it("returns the refusal untouched once the policy gives up, so the caller can read it", async () => {
    const body = { errors: [{ message: "slow down" }] };
    const doFetch = vi
      .fn()
      .mockResolvedValue(res(429, body, { "retry-after": "3600" }));
    const response = await createRetryingFetch("build", doFetch)(URL_, INIT);
    expect(response.status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual(body);
  });

  it("retries a call made with the URL alone, as a native fetch allows", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(res(200, OK_BODY));
    const response = await createRetryingFetch("build", doFetch)(URL_);
    expect(response.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(doFetch.mock.calls[1]).toEqual([URL_, undefined]);
  });

  it("is a plain pass-through when retry is off", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(res(429, {}, { "retry-after": "0" }));
    const response = await createRetryingFetch(false, doFetch)(URL_, INIT);
    expect(response.status).toBe(429);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });
});

describe("postGraphql GraphQL errors", () => {
  it("throws a CmssyGraphqlError that keeps the server's code, so a caller can tell NOT_FOUND from an outage", async () => {
    const doFetch = vi.fn().mockResolvedValue(
      res(200, {
        errors: [
          { message: "Order not found", extensions: { code: "NOT_FOUND" } },
        ],
      }),
    );
    const failure = await postGraphql(URL_, "q", {}, {
      fetch: doFetch,
      label: "order",
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CmssyGraphqlError);
    const thrown = failure as CmssyGraphqlError;
    expect(thrown.code).toBe("NOT_FOUND");
    expect(thrown.message).toBe("cmssy: order error - Order not found");
    expect(thrown.errors).toEqual([
      { message: "Order not found", extensions: { code: "NOT_FOUND" } },
    ]);
  });

  it("leaves code undefined when the server sent none", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(res(200, { errors: [{ message: "nope" }] }));
    const failure = await postGraphql(URL_, "q", {}, {
      fetch: doFetch,
      label: "x",
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(CmssyGraphqlError);
    expect((failure as CmssyGraphqlError).code).toBeUndefined();
  });
});

describe("build throttle shared per endpoint (CMS-2268)", () => {
  const NOW = Date.parse("2026-11-18T12:00:00Z");
  const ENDPOINT = "https://api.cmssy.io/public/o/w/graphql";
  const OTHER = "https://api.cmssy.io/public/o/other/graphql";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function call(url: string, doFetch: ReturnType<typeof vi.fn>, retry: "build" | "interactive" = "build") {
    return postGraphql(url, "q", {}, { fetch: doFetch, label: "t", retry });
  }

  function firedAt(doFetch: ReturnType<typeof vi.fn>, times: number[]) {
    doFetch.mockImplementation(async () => {
      times.push(Date.now() - NOW);
      return res(200, OK_BODY);
    });
  }

  it("holds concurrent requests behind one 429 with Retry-After, with no new 429 meanwhile", async () => {
    const throttled = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "10" }))
      .mockResolvedValueOnce(res(200, OK_BODY));
    const first = call(ENDPOINT, throttled);
    await vi.advanceTimersByTimeAsync(0);

    const times: number[] = [];
    const others = vi.fn();
    firedAt(others, times);
    const second = call(ENDPOINT, others);
    const third = call(ENDPOINT, others);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(others).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second, third]);
    expect(times).toEqual([10_000, 10_000]);
    expect(throttled).toHaveBeenCalledTimes(2);
  });

  it("holds the next request until X-RateLimit-Reset once remaining reaches the threshold", async () => {
    const reset = String(Math.ceil((NOW + 30_000) / 1000));
    const low = vi.fn().mockResolvedValue(
      res(200, OK_BODY, { "X-RateLimit-Remaining": "6", "X-RateLimit-Reset": reset }),
    );
    await call(ENDPOINT, low);

    const times: number[] = [];
    const next = vi.fn();
    firedAt(next, times);
    const pending = call(ENDPOINT, next);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(times).toEqual([30_000]);
  });

  it("does not hold while remaining stays above the threshold", async () => {
    const reset = String(Math.ceil((NOW + 30_000) / 1000));
    const plenty = vi.fn().mockResolvedValue(
      res(200, OK_BODY, { "X-RateLimit-Remaining": "7", "X-RateLimit-Reset": reset }),
    );
    await call(ENDPOINT, plenty);
    const times: number[] = [];
    const next = vi.fn();
    firedAt(next, times);
    await call(ENDPOINT, next);
    expect(times).toEqual([0]);
  });

  it("still throws CmssyRequestError when the retries run out", async () => {
    const always = vi.fn().mockResolvedValue(res(429, {}, { "Retry-After": "1" }));
    const pending = call(ENDPOINT, always).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(60_000);
    const error = await pending;
    expect(error).toBeInstanceOf(CmssyRequestError);
    expect((error as CmssyRequestError).status).toBe(429);
    expect(always).toHaveBeenCalledTimes(CMSSY_RETRY_MODES.build.maxRetries + 1);
  });

  it("does not pace when the rate-limit headers are missing", async () => {
    const bare = vi.fn().mockResolvedValue(res(200, OK_BODY, { "X-RateLimit-Remaining": "0" }));
    await call(ENDPOINT, bare);
    const times: number[] = [];
    const next = vi.fn();
    firedAt(next, times);
    await call(ENDPOINT, next);
    expect(times).toEqual([0]);
  });

  it("fails without waiting and holds nothing on a Retry-After above the policy", async () => {
    const long = vi.fn().mockResolvedValue(res(429, {}, { "Retry-After": "61" }));
    await expect(call(ENDPOINT, long)).rejects.toBeInstanceOf(CmssyRequestError);
    expect(long).toHaveBeenCalledTimes(1);
    const times: number[] = [];
    const next = vi.fn();
    firedAt(next, times);
    await call(ENDPOINT, next);
    expect(times).toEqual([0]);
  });

  it("does not hold a second endpoint", async () => {
    const throttled = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "10" }))
      .mockResolvedValueOnce(res(200, OK_BODY));
    const first = call(ENDPOINT, throttled);
    await vi.advanceTimersByTimeAsync(0);
    const times: number[] = [];
    const other = vi.fn();
    firedAt(other, times);
    await call(OTHER, other);
    expect(times).toEqual([0]);
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
  });

  it("holds nothing after a 429 without Retry-After", async () => {
    const monthly = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValue(res(200, OK_BODY));
    const first = call(ENDPOINT, monthly);
    await vi.advanceTimersByTimeAsync(0);
    const times: number[] = [];
    const next = vi.fn();
    firedAt(next, times);
    await call(ENDPOINT, next);
    expect(times).toEqual([0]);
    await vi.advanceTimersByTimeAsync(60_000);
    await first;
  });

  it("never holds an interactive request", async () => {
    const throttled = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { "Retry-After": "10" }))
      .mockResolvedValueOnce(res(200, OK_BODY));
    const first = call(ENDPOINT, throttled);
    await vi.advanceTimersByTimeAsync(0);
    const times: number[] = [];
    const runtime = vi.fn();
    firedAt(runtime, times);
    await call(ENDPOINT, runtime, "interactive");
    expect(times).toEqual([0]);
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
  });

  it("does not let an interactive response hold build requests", async () => {
    const reset = String(Math.ceil((NOW + 30_000) / 1000));
    const low = vi.fn().mockResolvedValue(
      res(200, OK_BODY, { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": reset }),
    );
    await call(ENDPOINT, low, "interactive");
    const times: number[] = [];
    const next = vi.fn();
    firedAt(next, times);
    await call(ENDPOINT, next);
    expect(times).toEqual([0]);
  });
});
