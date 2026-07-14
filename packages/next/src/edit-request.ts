import { isVerifiedEditUrl } from "@cmssy/core";

interface EditRequestLike {
  cookies: { has: (name: string) => boolean };
  nextUrl: {
    searchParams: {
      getAll: (name: string) => string[];
      get: (name: string) => string | null;
    };
  };
}

// Middleware runs on the edge, where next/headers does not exist - so this must
// stay in a module that never imports it. An edit request is either Next draft
// mode (the cookie set by the authenticated /api/draft route) or a verified
// editor request, and the verification itself lives in @cmssy/core.
export async function isCmssyEditRequest(
  request: EditRequestLike,
  config: { draftSecret: string },
): Promise<boolean> {
  if (request.cookies.has("__prerender_bypass")) return true;
  return isVerifiedEditUrl(request.nextUrl, config);
}
