import { graphqlRequest, resolveWorkspaceId } from "@cmssy/react";
import type { CmssyNextConfig } from "./config";
import type { CmssySessionPayload, CmssySessionUser } from "./session";

export interface AuthMutationResult {
  success: boolean;
  message: string;
}

export interface AuthTokenResult extends AuthMutationResult {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresIn: number | null;
}

const LOGIN_MUTATION = `mutation SiteMemberLogin($input: SiteMemberLoginInput!) {
  siteMemberLogin(input: $input) {
    success message accessToken refreshToken accessTokenExpiresIn
  }
}`;

const REGISTER_MUTATION = `mutation SiteMemberRegister($input: SiteMemberRegisterInput!) {
  siteMemberRegister(input: $input) { success message }
}`;

const REFRESH_MUTATION = `mutation SiteMemberRefresh($refreshToken: String!) {
  siteMemberRefresh(refreshToken: $refreshToken) {
    success message accessToken refreshToken accessTokenExpiresIn
  }
}`;

const LOGOUT_MUTATION = `mutation SiteMemberLogout($refreshToken: String!) {
  siteMemberLogout(refreshToken: $refreshToken) { success message }
}`;

const LOGOUT_EVERYWHERE_MUTATION = `mutation SiteMemberLogoutEverywhere {
  siteMemberLogoutEverywhere { success message }
}`;

const FORGOT_MUTATION = `mutation SiteMemberForgotPassword($modelSlug: String!, $identity: String!) {
  siteMemberForgotPassword(modelSlug: $modelSlug, identity: $identity) { success message }
}`;

const RESET_MUTATION = `mutation SiteMemberResetPassword($token: String!, $newPassword: String!) {
  siteMemberResetPassword(token: $token, newPassword: $newPassword) { success message }
}`;

const VERIFY_MUTATION = `mutation SiteMemberVerifyEmail($token: String!) {
  siteMemberVerifyEmail(token: $token) { success message }
}`;

const workspaceIdCache = new Map<string, Promise<string>>();

function workspaceIdFor(config: CmssyNextConfig): Promise<string> {
  const key = `${config.apiUrl}::${config.workspaceSlug}`;
  const existing = workspaceIdCache.get(key);
  if (existing) return existing;
  const fresh = resolveWorkspaceId(config).catch((err: unknown) => {
    workspaceIdCache.delete(key);
    throw err;
  });
  workspaceIdCache.set(key, fresh);
  return fresh;
}

export function clearWorkspaceIdCache(): void {
  workspaceIdCache.clear();
}

async function authRequest<T>(
  config: CmssyNextConfig,
  query: string,
  variables: Record<string, unknown>,
  label: string,
  accessToken?: string,
): Promise<T> {
  const workspaceId = await workspaceIdFor(config);
  return graphqlRequest<T>(
    config,
    query,
    variables,
    {
      headers: {
        "x-workspace-id": workspaceId,
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    },
    label,
  );
}

export function decodeAccessClaims(
  accessToken: string,
): CmssySessionUser | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    if (
      typeof json.recordId !== "string" ||
      typeof json.email !== "string" ||
      json.type !== "site_member"
    ) {
      return null;
    }
    return { recordId: json.recordId, email: json.email };
  } catch {
    return null;
  }
}

export function toSessionPayload(
  result: AuthTokenResult,
): CmssySessionPayload | null {
  if (
    !result.success ||
    !result.accessToken ||
    !result.refreshToken ||
    !result.accessTokenExpiresIn
  ) {
    return null;
  }
  const user = decodeAccessClaims(result.accessToken);
  if (!user) return null;
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    accessExpiresAt: Date.now() + result.accessTokenExpiresIn * 1000,
    user,
  };
}

export async function backendSignIn(
  config: CmssyNextConfig,
  modelSlug: string,
  identity: string,
  password: string,
): Promise<AuthTokenResult> {
  const data = await authRequest<{ siteMemberLogin: AuthTokenResult }>(
    config,
    LOGIN_MUTATION,
    {
      input: { modelSlug, identity, password },
    },
    "site member login",
  );
  return data.siteMemberLogin;
}

export async function backendRegister(
  config: CmssyNextConfig,
  modelSlug: string,
  identity: string,
  password: string,
  fields: Record<string, unknown>,
): Promise<AuthMutationResult> {
  const data = await authRequest<{ siteMemberRegister: AuthMutationResult }>(
    config,
    REGISTER_MUTATION,
    {
      input: { modelSlug, identity, password, fields },
    },
    "site member register",
  );
  return data.siteMemberRegister;
}

export async function backendRefresh(
  config: CmssyNextConfig,
  refreshToken: string,
): Promise<AuthTokenResult> {
  const data = await authRequest<{ siteMemberRefresh: AuthTokenResult }>(
    config,
    REFRESH_MUTATION,
    { refreshToken },
    "site member refresh",
  );
  return data.siteMemberRefresh;
}

export async function backendSignOut(
  config: CmssyNextConfig,
  refreshToken: string,
): Promise<void> {
  try {
    await authRequest(
      config,
      LOGOUT_MUTATION,
      { refreshToken },
      "site member logout",
    );
  } catch {
    return;
  }
}

export async function backendSignOutEverywhere(
  config: CmssyNextConfig,
  accessToken: string,
): Promise<void> {
  try {
    await authRequest(
      config,
      LOGOUT_EVERYWHERE_MUTATION,
      {},
      "site member logout everywhere",
      accessToken,
    );
  } catch {
    return;
  }
}

export async function backendForgotPassword(
  config: CmssyNextConfig,
  modelSlug: string,
  identity: string,
): Promise<AuthMutationResult> {
  const data = await authRequest<{
    siteMemberForgotPassword: AuthMutationResult;
  }>(
    config,
    FORGOT_MUTATION,
    { modelSlug, identity },
    "site member forgot password",
  );
  return data.siteMemberForgotPassword;
}

export async function backendResetPassword(
  config: CmssyNextConfig,
  token: string,
  newPassword: string,
): Promise<AuthMutationResult> {
  const data = await authRequest<{
    siteMemberResetPassword: AuthMutationResult;
  }>(
    config,
    RESET_MUTATION,
    { token, newPassword },
    "site member reset password",
  );
  return data.siteMemberResetPassword;
}

export async function backendVerifyEmail(
  config: CmssyNextConfig,
  token: string,
): Promise<AuthMutationResult> {
  const data = await authRequest<{ siteMemberVerifyEmail: AuthMutationResult }>(
    config,
    VERIFY_MUTATION,
    { token },
    "site member verify email",
  );
  return data.siteMemberVerifyEmail;
}
