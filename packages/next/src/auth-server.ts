import { cookies } from "next/headers";
import type { CmssyConfig } from "@cmssy/core";
import { assertAuthConfig } from "@cmssy/core";
import {
  CMSSY_SESSION_COOKIE,
  isAccessExpired,
  openSession,
  type CmssySessionPayload,
  type CmssySessionUser,
} from "@cmssy/core";

async function readValidSession(
  config: CmssyConfig,
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
  config: CmssyConfig,
): Promise<CmssySessionUser | null> {
  const session = await readValidSession(config);
  return session?.user ?? null;
}

export async function getCmssyAccessToken(
  config: CmssyConfig,
): Promise<string | null> {
  const session = await readValidSession(config);
  return session?.accessToken ?? null;
}
