import { cookies } from "next/headers";
import type { CmssyNextConfig } from "./config";
import { assertAuthConfig } from "./config";
import {
  CMSSY_SESSION_COOKIE,
  isAccessExpired,
  openSession,
  type CmssySessionPayload,
  type CmssySessionUser,
} from "./session";

async function readValidSession(
  config: CmssyNextConfig,
): Promise<CmssySessionPayload | null> {
  const auth = assertAuthConfig(config);
  const jar = await cookies();
  const raw = jar.get(CMSSY_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await openSession(
    raw,
    auth.sessionSecret,
    config.workspaceSlug,
  );
  if (!session || isAccessExpired(session)) return null;
  return session;
}

export async function getCmssyUser(
  config: CmssyNextConfig,
): Promise<CmssySessionUser | null> {
  const session = await readValidSession(config);
  return session?.user ?? null;
}

export async function getCmssyAccessToken(
  config: CmssyNextConfig,
): Promise<string | null> {
  const session = await readValidSession(config);
  return session?.accessToken ?? null;
}
