import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { CmssyConfig } from "@cmssy/core";
import { cmssySecretsMatch } from "@cmssy/core";

export type CmssyDraftRouteConfig = Pick<CmssyConfig, "draftSecret"> & {
  defaultRedirect?: string;
};

const MIN_SECRET_LENGTH = 16;

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
  const fallbackRedirect = config.defaultRedirect ?? "/";
  if (safeRedirect(fallbackRedirect, "/") !== fallbackRedirect) {
    throw new Error(
      "cmssy: defaultRedirect must be a same-origin path starting with '/'",
    );
  }
  return async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Exit path needs no secret - the visitor is only clearing their own
    // draft cookie. Without it the cookie never expires and the browser is
    // stuck previewing drafts (and bypassing the cache) forever.
    if (url.searchParams.get("disable") === "1") {
      const draft = await draftMode();
      draft.disable();
      redirect(
        safeRedirect(url.searchParams.get("redirect"), fallbackRedirect),
      );
    }
    if (config.draftSecret.length < MIN_SECRET_LENGTH) {
      return new Response(
        `cmssy: draftSecret must be at least ${MIN_SECRET_LENGTH} characters`,
        { status: 500 },
      );
    }
    const secret = url.searchParams.get("secret");
    if (!secret || !(await cmssySecretsMatch(secret, config.draftSecret))) {
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
