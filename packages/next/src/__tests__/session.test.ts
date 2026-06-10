import { describe, it, expect, vi, afterEach } from "vitest";
import {
  sealSession,
  openSession,
  isAccessExpired,
  sessionCookieOptions,
  deriveSessionKey,
  SESSION_MAX_AGE_SECONDS,
  MIN_SESSION_SECRET_LENGTH,
  ACCESS_EXPIRY_SKEW_MS,
  type CmssySessionPayload,
} from "../session";

const SECRET = "a".repeat(MIN_SESSION_SECRET_LENGTH);

const payload: CmssySessionPayload = {
  accessToken: "access-jwt",
  refreshToken: "refresh-jwt",
  accessExpiresAt: Date.now() + 15 * 60_000,
  user: { recordId: "rec-1", email: "user@example.com" },
};

describe("session seal/open", () => {
  it("round-trips a payload", async () => {
    const token = await sealSession(payload, SECRET);
    const opened = await openSession(token, SECRET);
    expect(opened).toEqual(payload);
  });

  it("returns null for a tampered token", async () => {
    const token = await sealSession(payload, SECRET);
    const tampered = token.slice(0, -4) + "AAAA";
    expect(await openSession(tampered, SECRET)).toBeNull();
  });

  it("returns null when opened with a different secret", async () => {
    const token = await sealSession(payload, SECRET);
    expect(await openSession(token, "b".repeat(32))).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await openSession("garbage", SECRET)).toBeNull();
    expect(await openSession("", SECRET)).toBeNull();
  });

  it("returns null when the payload shape is wrong", async () => {
    const token = await sealSession(
      { ...payload, user: { recordId: 1 } } as unknown as CmssySessionPayload,
      SECRET,
    );
    expect(await openSession(token, SECRET)).toBeNull();
  });

  it("rejects a secret shorter than 32 chars", async () => {
    await expect(sealSession(payload, "short")).rejects.toThrow(/32/);
    await expect(openSession("x", "short")).rejects.toThrow(/32/);
    await expect(deriveSessionKey("a".repeat(31))).rejects.toThrow(/32/);
  });

  it("returns null for a session past its 30-day envelope expiry", async () => {
    const token = await sealSession(payload, SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_MAX_AGE_SECONDS + 120) * 1000);
    try {
      expect(await openSession(token, SECRET)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds the session to an audience when provided", async () => {
    const token = await sealSession(payload, SECRET, "site-a");
    expect(await openSession(token, SECRET, "site-a")).toEqual(payload);
    expect(await openSession(token, SECRET, "site-b")).toBeNull();
    const unbound = await sealSession(payload, SECRET);
    expect(await openSession(unbound, SECRET, "site-a")).toBeNull();
  });

  it("drops smuggled extra properties on open", async () => {
    const token = await sealSession(
      { ...payload, isAdmin: true } as unknown as CmssySessionPayload,
      SECRET,
    );
    expect(await openSession(token, SECRET)).toEqual(payload);
  });

  it("rejects a non-finite accessExpiresAt", async () => {
    const token = await sealSession(
      { ...payload, accessExpiresAt: Number.NaN },
      SECRET,
    );
    expect(await openSession(token, SECRET)).toBeNull();
  });

  it("derives a deterministic 32-byte key", async () => {
    const a = await deriveSessionKey(SECRET);
    const b = await deriveSessionKey(SECRET);
    expect(a).toEqual(b);
    expect(a.byteLength).toBe(32);
  });
});

describe("isAccessExpired", () => {
  it("is false well before expiry", () => {
    expect(isAccessExpired(payload, payload.accessExpiresAt - 60_000)).toBe(
      false,
    );
  });

  it("is false just outside the skew window", () => {
    expect(
      isAccessExpired(
        payload,
        payload.accessExpiresAt - ACCESS_EXPIRY_SKEW_MS - 1,
      ),
    ).toBe(false);
  });

  it("is true inside the skew window", () => {
    expect(
      isAccessExpired(
        payload,
        payload.accessExpiresAt - ACCESS_EXPIRY_SKEW_MS + 1,
      ),
    ).toBe(true);
  });

  it("is true after expiry", () => {
    expect(isAccessExpired(payload, payload.accessExpiresAt + 1)).toBe(true);
  });
});

describe("sessionCookieOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("locks down the cookie", () => {
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it("is secure outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });

  it("is not secure in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
  });
});
