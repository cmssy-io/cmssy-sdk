import { headers } from "next/headers";
import { CMSSY_EDIT_HEADER, isVerifiedEditUrl } from "@cmssy/core";

interface EditRequestLike {
  cookies: { has: (name: string) => boolean };
  nextUrl: {
    searchParams: {
      getAll: (name: string) => string[];
      get: (name: string) => string | null;
    };
  };
}

// An edit request is either Next draft mode (the cookie set by the
// authenticated /api/draft route) or a verified editor request. The
// verification itself is framework-agnostic and lives in @cmssy/core; the draft
// cookie is Next's.
export async function isCmssyEditRequest(
  request: EditRequestLike,
  config: { draftSecret: string },
): Promise<boolean> {
  if (request.cookies.has("__prerender_bypass")) return true;
  return isVerifiedEditUrl(request.nextUrl, config);
}

export async function isCmssyEditMode(): Promise<boolean> {
  const h = await headers();
  return h.get(CMSSY_EDIT_HEADER) === "1";
}
