import { NextResponse, type NextRequest } from "next/server";
import { isCmssyEditRequest } from "./edit-mode";

/**
 * Where the middleware rewrites editor-preview traffic. Mount the matching
 * dynamic route in the consumer app:
 *
 *   app/__cmssy/edit/[[...path]]/page.tsx
 *     export const dynamic = "force-dynamic";
 *     export default createCmssyEditPage(cmssy, blocks, { editor: Editor });
 */
export const CMSSY_EDIT_PATH_PREFIX = "/__cmssy/edit";

/**
 * Rewrite editor-preview requests (`?cmssyEdit=1` or the draft-mode bypass
 * cookie) onto the dedicated dynamic edit route, so the public catch-all can
 * stay fully static. A static page never sees its query string - this rewrite
 * is what makes the `cmssyEdit` flag work at all once ISR is on. Returns null
 * for normal traffic so it composes with other middleware.
 */
export function cmssyEditRewrite(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith(CMSSY_EDIT_PATH_PREFIX)) return null;
  if (!isCmssyEditRequest(request)) return null;
  const url = request.nextUrl.clone();
  url.pathname = `${CMSSY_EDIT_PATH_PREFIX}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

/** Standalone middleware when the consumer has no other middleware to compose. */
export function createCmssyEditMiddleware() {
  return function cmssyEditMiddleware(request: NextRequest): NextResponse {
    return cmssyEditRewrite(request) ?? NextResponse.next();
  };
}
