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

export async function isCmssyEditRequest(
  request: EditRequestLike,
  config: { draftSecret: string },
): Promise<boolean> {
  if (request.cookies.has("__prerender_bypass")) return true;
  return isVerifiedEditUrl(request.nextUrl, config);
}
