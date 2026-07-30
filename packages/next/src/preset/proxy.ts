import { NextResponse, type NextRequest } from "next/server";
import { resolveSiteLocales } from "@cmssy/core/internal/locale";
import type { CmssyConfig } from "@cmssy/core";
import { applyCmssyCsp } from "@cmssy/core";
import { CMSSY_EDIT_HEADER } from "@cmssy/core";
import { cmssyEditRewrite } from "../edit-middleware";
import { CMSSY_LOCALE_HEADER, localeForPathname } from "@cmssy/core/internal/locale";

export interface CmssyProxyCookie {
  name: string;
  value: string;
  options?: Omit<Parameters<NextResponse["cookies"]["set"]>[2], "name" | "value">;
}

export interface CmssyProxyOptions {
  stripLocalePrefix?: boolean;
  cookies?: (
    request: NextRequest,
  ) => Promise<CmssyProxyCookie[]> | CmssyProxyCookie[];
}

const DEFAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

function mergeCookieHeader(
  header: string | null,
  writes: CmssyProxyCookie[],
): string {
  const written = new Set(writes.map((write) => write.name));
  const kept = (header ?? "")
    .split(/; */)
    .filter(Boolean)
    .filter((cookie) => !written.has(cookie.split("=")[0] ?? ""));
  const added = writes
    .filter((write) => write.value)
    .map((write) => `${write.name}=${write.value}`);
  return [...kept, ...added].join("; ");
}

export function createCmssyProxy(
  config: CmssyConfig,
  options: CmssyProxyOptions = {},
) {
  return async function cmssyProxy(request: NextRequest): Promise<NextResponse> {
    const { pathname } = request.nextUrl;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete(CMSSY_EDIT_HEADER);
    requestHeaders.delete(CMSSY_LOCALE_HEADER);

    const writes = (await options.cookies?.(request)) ?? [];
    if (writes.length > 0) {
      requestHeaders.set(
        "cookie",
        mergeCookieHeader(requestHeaders.get("cookie"), writes),
      );
    }
    const persist = <T extends NextResponse>(response: T): T => {
      for (const write of writes) {
        response.cookies.set(write.name, write.value, {
          ...DEFAULT_COOKIE_OPTIONS,
          ...write.options,
          ...(write.value ? {} : { maxAge: 0 }),
        });
      }
      return response;
    };

    const locale = await localeForPathname(config, pathname);
    requestHeaders.set(CMSSY_LOCALE_HEADER, locale);

    const editHeaders = new Headers(requestHeaders);
    editHeaders.set(CMSSY_EDIT_HEADER, "1");
    const editRewrite = await cmssyEditRewrite(request, config, {
      requestHeaders: editHeaders,
    });
    if (editRewrite) {
      applyCmssyCsp(editRewrite, { editorOrigin: config.editorOrigin });
      return persist(editRewrite);
    }

    if (options.stripLocalePrefix && pathname.startsWith(`/${locale}`)) {
      const { defaultLocale } = await resolveSiteLocales(config);
      if (locale !== defaultLocale) {
        const url = request.nextUrl.clone();
        url.pathname = pathname.slice(locale.length + 1) || "/";
        return persist(
          NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
        );
      }
    }

    return persist(NextResponse.next({ request: { headers: requestHeaders } }));
  };
}

export const cmssyProxyMatcher = ["/((?!_next/|api/|.*\\..*).*)"];
