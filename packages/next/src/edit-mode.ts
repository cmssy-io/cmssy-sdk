import { headers } from "next/headers";

// Middleware forwards this header so server components (the root layout can't
// read searchParams) can detect editor-preview mode on the same signal content
// uses, and fetch draft vs published layouts accordingly.
export const CMSSY_EDIT_HEADER = "x-cmssy-edit";

interface EditRequestLike {
  cookies: { has: (name: string) => boolean };
  nextUrl: { searchParams: { getAll: (name: string) => string[] } };
}

export function isCmssyEditRequest(request: EditRequestLike): boolean {
  return (
    request.cookies.has("__prerender_bypass") ||
    request.nextUrl.searchParams.getAll("cmssyEdit").includes("1")
  );
}

export async function isCmssyEditMode(): Promise<boolean> {
  const h = await headers();
  return h.get(CMSSY_EDIT_HEADER) === "1";
}
