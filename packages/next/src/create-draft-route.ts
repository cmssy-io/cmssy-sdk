import { createHash, timingSafeEqual } from "node:crypto";
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { CmssyNextConfig } from "./config";

export type CmssyDraftRouteConfig = Pick<CmssyNextConfig, "draftSecret"> & {
  defaultRedirect?: string;
};

const MIN_SECRET_LENGTH = 16;

function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function safeRedirect(redirect: string | null, fallback: string): string {
  if (!redirect || !redirect.startsWith("/")) return fallback;
  if (redirect.startsWith("//") || redirect.includes("\\")) return fallback;
  try {
    if (
      new URL(redirect, "https://cmssy.invalid").origin !==
      "https://cmssy.invalid"
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }
  return redirect;
}

export function createDraftRoute(config: CmssyDraftRouteConfig) {
  if (config.draftSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `cmssy: draftSecret must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  const fallbackRedirect = config.defaultRedirect ?? "/";
  if (safeRedirect(fallbackRedirect, "/") !== fallbackRedirect) {
    throw new Error(
      "cmssy: defaultRedirect must be a same-origin path starting with '/'",
    );
  }
  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    if (!secret || !secretsMatch(secret, config.draftSecret)) {
      return new Response("Invalid draft secret", { status: 401 });
    }
    const location = safeRedirect(
      url.searchParams.get("redirect"),
      fallbackRedirect,
    );
    const draft = await draftMode();
    draft.enable();
    redirect(location);
  };
}
