import { graphqlRequest } from "./data/graphql-request";
import { cachedWorkspaceId } from "./data/settings-client";
import type { CmssyConfig } from "./config";
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

export const LOGIN_MUTATION = `mutation SiteMemberLogin($input: SiteMemberLoginInput!) {
  siteMember {
    login(input: $input) {
      success message accessToken refreshToken accessTokenExpiresIn
    }
  }
}`;

export const REGISTER_MUTATION = `mutation SiteMemberRegister($input: SiteMemberRegisterInput!) {
  siteMember {
    register(input: $input) { success message }
  }
}`;

export const REFRESH_MUTATION = `mutation SiteMemberRefresh($refreshToken: String!) {
  siteMember {
    refresh(refreshToken: $refreshToken) {
      success message accessToken refreshToken accessTokenExpiresIn
    }
  }
}`;

export const LOGOUT_MUTATION = `mutation SiteMemberLogout($refreshToken: String!) {
  siteMember {
    logout(refreshToken: $refreshToken) { success message }
  }
}`;

export const LOGOUT_EVERYWHERE_MUTATION = `mutation SiteMemberLogoutEverywhere {
  siteMember {
    logoutEverywhere { success message }
  }
}`;

export const FORGOT_MUTATION = `mutation SiteMemberForgotPassword($modelSlug: String!, $identity: String!) {
  siteMember {
    forgotPassword(modelSlug: $modelSlug, identity: $identity) { success message }
  }
}`;

export const RESET_MUTATION = `mutation SiteMemberResetPassword($token: String!, $newPassword: String!) {
  siteMember {
    resetPassword(token: $token, newPassword: $newPassword) { success message }
  }
}`;

export const VERIFY_MUTATION = `mutation SiteMemberVerifyEmail($token: String!) {
  siteMember {
    verifyEmail(token: $token) { success message }
  }
}`;

async function authRequest<T>(
  config: CmssyConfig,
  query: string,
  variables: Record<string, unknown>,
  label: string,
  accessToken?: string,
): Promise<T> {
  const workspaceId = await cachedWorkspaceId(config);
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
  config: CmssyConfig,
  modelSlug: string,
  identity: string,
  password: string,
): Promise<AuthTokenResult> {
  const data = await authRequest<{ siteMember: { login: AuthTokenResult } }>(
    config,
    LOGIN_MUTATION,
    {
      input: { modelSlug, identity, password },
    },
    "site member login",
  );
  return data.siteMember.login;
}

export async function backendRegister(
  config: CmssyConfig,
  modelSlug: string,
  identity: string,
  password: string,
  fields: Record<string, unknown>,
): Promise<AuthMutationResult> {
  const data = await authRequest<{ siteMember: { register: AuthMutationResult } }>(
    config,
    REGISTER_MUTATION,
    {
      input: { modelSlug, identity, password, fields },
    },
    "site member register",
  );
  return data.siteMember.register;
}

export async function backendRefresh(
  config: CmssyConfig,
  refreshToken: string,
): Promise<AuthTokenResult> {
  const data = await authRequest<{ siteMember: { refresh: AuthTokenResult } }>(
    config,
    REFRESH_MUTATION,
    { refreshToken },
    "site member refresh",
  );
  return data.siteMember.refresh;
}

export async function backendSignOut(
  config: CmssyConfig,
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
  config: CmssyConfig,
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
  config: CmssyConfig,
  modelSlug: string,
  identity: string,
): Promise<AuthMutationResult> {
  const data = await authRequest<{
    siteMember: { forgotPassword: AuthMutationResult };
  }>(
    config,
    FORGOT_MUTATION,
    { modelSlug, identity },
    "site member forgot password",
  );
  return data.siteMember.forgotPassword;
}

export async function backendResetPassword(
  config: CmssyConfig,
  token: string,
  newPassword: string,
): Promise<AuthMutationResult> {
  const data = await authRequest<{
    siteMember: { resetPassword: AuthMutationResult };
  }>(
    config,
    RESET_MUTATION,
    { token, newPassword },
    "site member reset password",
  );
  return data.siteMember.resetPassword;
}

export async function backendVerifyEmail(
  config: CmssyConfig,
  token: string,
): Promise<AuthMutationResult> {
  const data = await authRequest<{ siteMember: { verifyEmail: AuthMutationResult } }>(
    config,
    VERIFY_MUTATION,
    { token },
    "site member verify email",
  );
  return data.siteMember.verifyEmail;
}
