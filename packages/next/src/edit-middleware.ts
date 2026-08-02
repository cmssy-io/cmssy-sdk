import { NextResponse, type NextRequest } from "next/server";
import { CMSSY_EDIT_QUERY_PARAM, CMSSY_SECRET_QUERY_PARAM } from "@cmssy/core";
import { cmssySecretsMatch } from "@cmssy/core/internal";

export const CMSSY_EDIT_PATH_PREFIX = "/cmssy-edit";

export async function cmssyEditRewrite(
  request: NextRequest,
  config: { draftSecret: string },
  options: {
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
  warnIfEditRouteMissing(url);
  return NextResponse.rewrite(
    url,
    options.requestHeaders
      ? { request: { headers: options.requestHeaders } }
      : undefined,
  );
}

export function createCmssyEditMiddleware(config: { draftSecret: string }) {
  return async function cmssyEditMiddleware(
    request: NextRequest,
  ): Promise<NextResponse> {
    return (await cmssyEditRewrite(request, config)) ?? NextResponse.next();
  };
}

let probed = false;

function warnIfEditRouteMissing(url: URL): void {
  if (process.env.NODE_ENV === "production" || probed) return;
  probed = true;

  void fetch(url, { method: "HEAD" })
    .then((response) => {
      if (response.status !== 404) return;
      console.error(
        `[cmssy] The editor request was rewritten to ${url.pathname}, but nothing is mounted there ` +
          `(404). Add the edit route:\n\n` +
          `  // app/cmssy-edit/[[...path]]/page.tsx\n` +
          `  export const dynamic = "force-dynamic";\n` +
          `  export default createCmssyEditPage(cmssy, blocks, { editor: CmssyEditor });\n\n` +
          `Until then the editor preview stays blank.`,
      );
    })
    .catch(() => {
    });
}
