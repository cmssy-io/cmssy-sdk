import { EncryptJWT, jwtDecrypt } from "jose";
import type {
  CmssySessionUser,
  CmssySessionPayload,
  SessionCookieOptions,
} from "@cmssy/types";

// Session data shapes live in @cmssy/types; re-exported for consumers.
export type { CmssySessionUser, CmssySessionPayload, SessionCookieOptions };

export const CMSSY_SESSION_COOKIE = "cmssy_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const MIN_SESSION_SECRET_LENGTH = 32;
export const ACCESS_EXPIRY_SKEW_MS = 30_000;

export async function deriveSessionKey(secret: string): Promise<Uint8Array> {
  if (typeof secret !== "string" || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `cmssy auth sessionSecret must be at least ${MIN_SESSION_SECRET_LENGTH} characters`,
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return new Uint8Array(digest);
}

export async function sealSession(
  payload: CmssySessionPayload,
  secret: string,
  audience?: string,
): Promise<string> {
  const key = await deriveSessionKey(secret);
  const jwt = new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`);
  if (audience) jwt.setAudience(audience);
  return jwt.encrypt(key);
}

export async function openSession(
  token: string,
  secret: string,
  audience?: string,
): Promise<CmssySessionPayload | null> {
  const key = await deriveSessionKey(secret);
  try {
    const { payload } = await jwtDecrypt(token, key, {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      ...(audience ? { audience } : {}),
    });
    const { accessToken, refreshToken, accessExpiresAt, user } = payload as
      Record<string, unknown> | CmssySessionPayload;
    if (
      typeof accessToken !== "string" ||
      typeof refreshToken !== "string" ||
      !Number.isFinite(accessExpiresAt) ||
      !user ||
      typeof user !== "object" ||
      typeof (user as CmssySessionUser).recordId !== "string" ||
      typeof (user as CmssySessionUser).email !== "string"
    ) {
      return null;
    }
    return {
      accessToken,
      refreshToken,
      accessExpiresAt: accessExpiresAt as number,
      user: {
        recordId: (user as CmssySessionUser).recordId,
        email: (user as CmssySessionUser).email,
      },
    };
  } catch {
    return null;
  }
}

export function isAccessExpired(
  payload: CmssySessionPayload,
  now: number = Date.now(),
): boolean {
  return payload.accessExpiresAt <= now + ACCESS_EXPIRY_SKEW_MS;
}

export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
