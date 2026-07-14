import { NextResponse, type NextRequest } from "next/server";
import { CMSSY_EDIT_QUERY_PARAM, CMSSY_SECRET_QUERY_PARAM } from "./edit-mode";
import { cmssySecretsMatch } from "./secret-match";

/**
 * Where the middleware rewrites editor-preview traffic. Mount the matching
 * dynamic route in the consumer app:
 *
 *   app/cmssy-edit/[[...path]]/page.tsx
 *     export const dynamic = "force-dynamic";
 *     export default createCmssyEditPage(cmssy, blocks, { editor: Editor });
 */
export const CMSSY_EDIT_PATH_PREFIX = "/cmssy-edit";

/**
 * Rewrite VERIFIED editor requests (`cmssyEdit=1` + a `cmssySecret` matching
 * the site's draft secret, CMS-948) onto the dedicated dynamic edit route, so
 * the public catch-all can stay fully static. A static page never sees its
 * query string - this rewrite is what makes the editor iframe work at all
 * once ISR is on. Draft-mode preview (the authenticated /api/draft cookie) is
 * NOT rewritten: it renders draft content on the public route via
 * `draftMode()`, without the editor. Returns null for normal traffic so it
 * composes with other middleware.
 */
export async function cmssyEditRewrite(
  request: NextRequest,
  config: { draftSecret: string },
  options: {
    /**
     * Headers to forward to the edit route, for a site whose middleware tells
     * the app something the path alone does not - a resolved locale, say.
     * Without them the editor preview renders in the default language while the
     * public page renders in the visitor's.
     */
    requestHeaders?: Headers;
  } = {},
): Promise<NextResponse | null> {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith(CMSSY_EDIT_PATH_PREFIX)) return null;
  if (!searchParams.getAll(CMSSY_EDIT_QUERY_PARAM).includes("1")) return null;
  const provided = searchParams.get(CMSSY_SECRET_QUERY_PARAM);
  if (!provided || !config.draftSecret) return null;
  if (!(await cmssySecretsMatch(provided, config.draftSecret))) return null;
  const url = request.nextUrl.clone();
  url.pathname = `${CMSSY_EDIT_PATH_PREFIX}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(
    url,
    options.requestHeaders
      ? { request: { headers: options.requestHeaders } }
      : undefined,
  );
}

/** Standalone middleware when the consumer has no other middleware to compose. */
export function createCmssyEditMiddleware(config: { draftSecret: string }) {
  return async function cmssyEditMiddleware(
    request: NextRequest,
  ): Promise<NextResponse> {
    return (await cmssyEditRewrite(request, config)) ?? NextResponse.next();
  };
}
