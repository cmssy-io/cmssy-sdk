import { cookies } from "next/headers";
import type { CmssyConfig, CmssyAuthConfig } from "@cmssy/core";
import { assertAuthConfig } from "@cmssy/core";
import {
  CMSSY_SESSION_COOKIE,
  isAccessExpired,
  openSession,
  sealSession,
  sessionCookieOptions,
  type CmssySessionPayload,
} from "@cmssy/core";
import {
  backendForgotPassword,
  backendRefresh,
  backendRegister,
  backendResetPassword,
  backendSignIn,
  backendSignOut,
  backendSignOutEverywhere,
  backendVerifyEmail,
  toSessionPayload,
} from "@cmssy/core";

const MAX_BODY_CHARS = 16 * 1024;

export interface CmssyAuthRouteHandlers {
  POST(
    request: Request,
    context: { params: Promise<{ action: string }> },
  ): Promise<Response>;
  GET(
    request: Request,
    context: { params: Promise<{ action: string }> },
  ): Promise<Response>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("content-type must be application/json");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    throw new Error("body too large");
  }
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function readSession(
  config: CmssyConfig,
  auth: CmssyAuthConfig,
): Promise<CmssySessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(CMSSY_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return openSession(raw, auth.sessionSecret, config.workspaceSlug);
}

async function writeSession(
  config: CmssyConfig,
  auth: CmssyAuthConfig,
  payload: CmssySessionPayload,
): Promise<void> {
  const sealed = await sealSession(
    payload,
    auth.sessionSecret,
    config.workspaceSlug,
  );
  const jar = await cookies();
  jar.set(CMSSY_SESSION_COOKIE, sealed, sessionCookieOptions());
}

async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set(CMSSY_SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
}

async function refreshSession(
  config: CmssyConfig,
  auth: CmssyAuthConfig,
  session: CmssySessionPayload,
): Promise<CmssySessionPayload | null> {
  const result = await backendRefresh(config, session.refreshToken);
  const payload = toSessionPayload(result);
  if (!payload) {
    await clearSession();
    return null;
  }
  await writeSession(config, auth, payload);
  return payload;
}

export function createCmssyAuthRoute(
  config: CmssyConfig,
): CmssyAuthRouteHandlers {
  const auth = assertAuthConfig(config);

  async function handleSignIn(body: Record<string, unknown>) {
    const identity = str(body.identity);
    const password = str(body.password);
    if (!identity || !password) {
      return json({ ok: false, message: "Invalid credentials." }, 400);
    }
    const result = await backendSignIn(
      config,
      auth.modelSlug,
      identity,
      password,
    );
    const payload = toSessionPayload(result);
    if (!payload) {
      return json({ ok: false, message: result.message }, 401);
    }
    await writeSession(config, auth, payload);
    return json({ ok: true, user: payload.user });
  }

  async function handleRegister(body: Record<string, unknown>) {
    const identity = str(body.identity);
    const password = str(body.password);
    if (!identity || !password) {
      return json({ ok: false, message: "Invalid input." }, 400);
    }
    const result = await backendRegister(
      config,
      auth.modelSlug,
      identity,
      password,
      plainObject(body.fields),
    );
    return json({ ok: result.success, message: result.message });
  }

  async function handleSignOut() {
    const session = await readSession(config, auth);
    if (session) {
      await backendSignOut(config, session.refreshToken);
    }
    await clearSession();
    return json({ ok: true });
  }

  async function handleSignOutEverywhere() {
    let session = await readSession(config, auth);
    if (session && isAccessExpired(session)) {
      session = await refreshSession(config, auth, session);
    }
    if (session) {
      await backendSignOutEverywhere(config, session.accessToken);
    }
    await clearSession();
    return json({ ok: true });
  }

  async function handleRefresh() {
    const session = await readSession(config, auth);
    if (!session) {
      return json({ ok: false, user: null }, 401);
    }
    const refreshed = await refreshSession(config, auth, session);
    if (!refreshed) {
      return json({ ok: false, user: null }, 401);
    }
    return json({ ok: true, user: refreshed.user });
  }

  async function handleMe() {
    let session = await readSession(config, auth);
    if (session && isAccessExpired(session)) {
      session = await refreshSession(config, auth, session);
    }
    return json({ user: session?.user ?? null });
  }

  async function handleForgotPassword(body: Record<string, unknown>) {
    const identity = str(body.identity);
    if (!identity) {
      return json({ ok: false, message: "Invalid input." }, 400);
    }
    const result = await backendForgotPassword(
      config,
      auth.modelSlug,
      identity,
    );
    return json({ ok: result.success, message: result.message });
  }

  async function handleResetPassword(body: Record<string, unknown>) {
    const token = str(body.token);
    const newPassword = str(body.newPassword);
    if (!token || !newPassword) {
      return json({ ok: false, message: "Invalid input." }, 400);
    }
    const result = await backendResetPassword(config, token, newPassword);
    return json({ ok: result.success, message: result.message });
  }

  async function handleVerifyEmail(body: Record<string, unknown>) {
    const token = str(body.token);
    if (!token) {
      return json({ ok: false, message: "Invalid input." }, 400);
    }
    const result = await backendVerifyEmail(config, token);
    return json({ ok: result.success, message: result.message });
  }

  return {
    async POST(request, context) {
      const { action } = await context.params;
      let body: Record<string, unknown>;
      try {
        body = await readBody(request);
      } catch {
        return json({ ok: false, message: "Invalid request body." }, 400);
      }
      try {
        switch (action) {
          case "sign-in":
            return await handleSignIn(body);
          case "register":
            return await handleRegister(body);
          case "sign-out":
            return await handleSignOut();
          case "sign-out-everywhere":
            return await handleSignOutEverywhere();
          case "refresh":
            return await handleRefresh();
          case "forgot-password":
            return await handleForgotPassword(body);
          case "reset-password":
            return await handleResetPassword(body);
          case "verify-email":
            return await handleVerifyEmail(body);
          default:
            return json({ ok: false, message: "Not found." }, 404);
        }
      } catch {
        return json({ ok: false, message: "Something went wrong." }, 500);
      }
    },

    async GET(_request, context) {
      const { action } = await context.params;
      if (action !== "me") {
        return json({ ok: false, message: "Not found." }, 404);
      }
      try {
        return await handleMe();
      } catch {
        return json({ user: null });
      }
    },
  };
}
