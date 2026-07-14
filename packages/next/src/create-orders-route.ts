import { cookies } from "next/headers";

import type { CmssyConfig } from "@cmssy/core";
import { CMSSY_SESSION_COOKIE, isAccessExpired, openSession } from "@cmssy/core";
import { backendMyOrder, backendMyOrders } from "@cmssy/core";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface CmssyOrdersRouteHandlers {
  GET(request: Request): Promise<Response>;
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

export function createCmssyOrdersRoute(
  config: CmssyConfig,
): CmssyOrdersRouteHandlers {
  async function memberAccessToken(): Promise<string | undefined> {
    if (!config.auth) return undefined;
    const jar = await cookies();
    const raw = jar.get(CMSSY_SESSION_COOKIE)?.value;
    if (!raw) return undefined;
    const session = await openSession(
      raw,
      config.auth.sessionSecret,
      config.workspaceSlug,
    );
    if (!session || isAccessExpired(session)) return undefined;
    return session.accessToken;
  }

  return {
    async GET(request) {
      const accessToken = await memberAccessToken();
      if (!accessToken) {
        return json({ message: "Not signed in." }, 401);
      }
      const url = new URL(request.url);
      try {
        const id = url.searchParams.get("id");
        if (id) {
          return json({ order: await backendMyOrder(config, accessToken, id) });
        }
        const skip = Math.max(
          0,
          Math.floor(Number(url.searchParams.get("skip")) || 0),
        );
        const limitParam = Math.floor(Number(url.searchParams.get("limit")));
        const limit =
          Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(limitParam, MAX_LIMIT)
            : DEFAULT_LIMIT;
        const result = await backendMyOrders(config, accessToken, {
          skip,
          limit,
        });
        return json(result);
      } catch (err) {
        return json(
          { message: err instanceof Error ? err.message : "Orders error" },
          502,
        );
      }
    },
  };
}
