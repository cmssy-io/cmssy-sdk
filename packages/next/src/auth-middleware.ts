import { NextResponse, type NextRequest } from "next/server";
import type { CmssyConfig } from "@cmssy/core";
import { assertAuthConfig } from "@cmssy/core";
import { backendRefresh, toSessionPayload } from "@cmssy/core";
import {
  CMSSY_SESSION_COOKIE,
  isAccessExpired,
  openSession,
  sealSession,
  sessionCookieOptions,
} from "@cmssy/core";

export type CmssyAuthMiddleware = (
  request: NextRequest,
) => Promise<NextResponse>;

function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("purpose") === "prefetch" ||
    (request.headers.get("sec-purpose") ?? "").includes("prefetch")
  );
}

export function createCmssyAuthMiddleware(
  config: CmssyConfig,
): CmssyAuthMiddleware {
  const auth = assertAuthConfig(config);

  return async function cmssyAuthMiddleware(request: NextRequest) {
    const raw = request.cookies.get(CMSSY_SESSION_COOKIE)?.value;
    if (!raw) return NextResponse.next();

    const session = await openSession(
      raw,
      auth.sessionSecret,
      config.workspaceSlug,
    );
    if (!session) {
      const response = NextResponse.next();
      response.cookies.set(CMSSY_SESSION_COOKIE, "", {
        ...sessionCookieOptions(),
        maxAge: 0,
      });
      return response;
    }
    if (!isAccessExpired(session)) return NextResponse.next();
    if (isPrefetch(request)) return NextResponse.next();

    let payload = null;
    try {
      const result = await backendRefresh(config, session.refreshToken);
      payload = toSessionPayload(result);
    } catch {
      return NextResponse.next();
    }

    if (!payload) {
      const cleared = NextResponse.next();
      cleared.cookies.set(CMSSY_SESSION_COOKIE, "", {
        ...sessionCookieOptions(),
        maxAge: 0,
      });
      return cleared;
    }

    const sealed = await sealSession(
      payload,
      auth.sessionSecret,
      config.workspaceSlug,
    );
    request.cookies.set(CMSSY_SESSION_COOKIE, sealed);
    const refreshed = NextResponse.next({ request });
    refreshed.cookies.set(CMSSY_SESSION_COOKIE, sealed, sessionCookieOptions());
    return refreshed;
  };
}
