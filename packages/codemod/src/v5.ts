import type { TransformResult } from "./v8";

export const RENAMES: Record<string, string> = {
  CmssyNextConfig: "CmssyConfig",
  clearCartWorkspaceIdCache: "clearWorkspaceIdCache",
};

export const SERVER_SYMBOLS = new Set([
  "createCmssyPage",
  "createCmssyEditPage",
  "CmssyLayoutSlot",
  "CmssyLayoutSlotProps",
  "CmssyLayoutSlotRenderProps",
  "resolveCmssyLayout",
  "CmssyLayoutResolution",
  "CmssyLayoutEditableProps",
  "ResolveCmssyLayoutOptions",
  "createDraftRoute",
  "CmssyDraftRouteConfig",
  "createCmssyRevalidateRoute",
  "CmssyRevalidateRouteConfig",
  "createCmssyBlockDataRoute",
  "CmssyBlockDataRouteConfig",
  "isCmssyEditMode",
]);

export const MIDDLEWARE_SYMBOLS = new Set([
  "createCmssyProxy",
  "cmssyProxyMatcher",
  "CmssyProxyOptions",
  "CmssyProxyCookie",
  "cmssyEditRewrite",
  "createCmssyEditMiddleware",
  "CMSSY_EDIT_PATH_PREFIX",
  "isCmssyEditRequest",
  "applyCmssyCsp",
  "CmssyCspOptions",
]);

export const CORE_SYMBOLS = new Set([
  "DEFAULT_CMSSY_API_URL",
  "evaluateFieldConditionGroup",
  "FieldCondition",
  "FieldConditionGroup",
  "FieldConditionLogic",
  "verifyCmssyWebhook",
  "CmssyWebhookError",
  "CmssyWebhookEvent",
  "CmssyWebhookOrder",
  "VerifyCmssyWebhookOptions",
]);

const OWN_SESSION = "your own session, plus the delivery API's member mutations";
const OWN_ACTIONS = "your Server Actions over the cart and order mutations";
const CORE_INTERNAL =
  "no public replacement - @cmssy/core/internal has it, and internal changes without a major";
const REACT_INTERNAL =
  "no public replacement - @cmssy/react/internal has it (@cmssy/remix for React Router), and internal changes without a major";

export const RETIRED_SYMBOLS: Record<string, string> = {
  buildCmssyMetadata: "your generateMetadata, querying public.page.get",
  BuildCmssyMetadataOptions: "your generateMetadata, querying public.page.get",
  createCmssySitemap: "your app/sitemap.ts, querying public.page.list",
  CreateCmssySitemapOptions: "your app/sitemap.ts, querying public.page.list",
  CmssySitemapContext: "your app/sitemap.ts, querying public.page.list",
  createCmssyRobots: "your app/robots.ts",
  CreateCmssyRobotsOptions: "your app/robots.ts",
  createCmssyNotFound: "your app/not-found.tsx",
  CreateCmssyNotFoundOptions: "your app/not-found.tsx",
  CmssyLink: "next/link plus localizeHref(href, locale)",
  CmssyLinkProps: "next/link plus localizeHref(href, locale)",
  getCmssyLocale: "the routed path, or CMSSY_LOCALE_HEADER",
  getCmssyUser: OWN_SESSION,
  getCmssyAccessToken: OWN_SESSION,
  createCmssyAuthRoute: OWN_SESSION,
  CmssyAuthRouteHandlers: OWN_SESSION,
  createCmssyAuthMiddleware: OWN_SESSION,
  CmssyAuthMiddleware: OWN_SESSION,
  sealSession: OWN_SESSION,
  openSession: OWN_SESSION,
  isAccessExpired: OWN_SESSION,
  sessionCookieOptions: OWN_SESSION,
  SessionCookieOptions: OWN_SESSION,
  SESSION_MAX_AGE_SECONDS: OWN_SESSION,
  CmssySessionPayload: OWN_SESSION,
  CmssySessionUser: OWN_SESSION,
  createCmssyCartRoute: OWN_ACTIONS,
  CmssyCartRouteHandlers: OWN_ACTIONS,
  CMSSY_CART_COOKIE: OWN_ACTIONS,
  createCmssyOrdersRoute: OWN_ACTIONS,
  CmssyOrdersRouteHandlers: OWN_ACTIONS,
  fetchProducts: OWN_ACTIONS,
  fetchProduct: OWN_ACTIONS,
  FetchProductsOptions: OWN_ACTIONS,
  FetchProductOptions: OWN_ACTIONS,
  CmssyProductPage: OWN_ACTIONS,
  CmssyStockState: OWN_ACTIONS,
  fetchOrderByToken: OWN_ACTIONS,
  FetchOrderByTokenOptions: OWN_ACTIONS,
  MyOrdersResult: OWN_ACTIONS,
  createCmssyLocaleMiddleware: "createCmssyProxy - it resolves the language",
  resolveLocaleFromPathname: "createCmssyProxy - it resolves the language",
  cmssyCspHeaders: "applyCmssyCsp from @cmssy/next/middleware",
  resolveApiUrl: CORE_INTERNAL,
  splitCmssyLocale: CORE_INTERNAL,
  localeForPathname: CORE_INTERNAL,
  CmssyLocaleProvider: REACT_INTERNAL,
  CmssyLocaleProviderProps: REACT_INTERNAL,
  useCmssyLocale: REACT_INTERNAL,
};

const ENTRY_FOR = (symbol: string): string => {
  if (SERVER_SYMBOLS.has(symbol)) return "@cmssy/next/server";
  if (MIDDLEWARE_SYMBOLS.has(symbol)) return "@cmssy/next/middleware";
  if (CORE_SYMBOLS.has(symbol)) return "@cmssy/core";
  return "@cmssy/next";
};

const IMPORT =
  /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']@cmssy\/next(?:\/preset)?["'];?/g;

interface Specifier {
  raw: string;
  name: string;
}

function parseSpecifiers(body: string): Specifier[] {
  return body
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((raw) => {
      const withoutType = raw.replace(/^type\s+/, "");
      const name = (withoutType.split(/\s+as\s+/)[0] ?? withoutType).trim();
      return { raw, name };
    });
}

function applyRenames(specifier: Specifier): Specifier {
  const replacement = RENAMES[specifier.name];
  if (!replacement) return specifier;
  return {
    name: replacement,
    raw: specifier.raw.replace(specifier.name, replacement),
  };
}

export function transform(source: string): TransformResult {
  let changed = false;
  const retired: string[] = [];

  let code = source.replace(IMPORT, (match, typeOnly, body: string) => {
    const specifiers = parseSpecifiers(body).map(applyRenames);
    if (specifiers.length === 0) return match;

    const byEntry = new Map<string, string[]>();
    for (const specifier of specifiers) {
      if (
        specifier.name in RETIRED_SYMBOLS &&
        !retired.includes(specifier.name)
      ) {
        retired.push(specifier.name);
      }
      const entry = ENTRY_FOR(specifier.name);
      const bucket = byEntry.get(entry) ?? [];
      bucket.push(specifier.raw);
      byEntry.set(entry, bucket);
    }

    const prefix = typeOnly ? "import type " : "import ";
    const rewritten = [...byEntry]
      .map(
        ([entry, names]) => `${prefix}{ ${names.join(", ")} } from "${entry}";`,
      )
      .join("\n");

    if (rewritten !== match) changed = true;
    return rewritten;
  });

  for (const [from, to] of Object.entries(RENAMES)) {
    const pattern = new RegExp(`\\b${from}\\b`, "g");
    if (pattern.test(code)) {
      code = code.replace(pattern, to);
      changed = true;
    }
  }

  const notes = retired.map(
    (symbol) =>
      `${symbol} is gone from the SDK - ${RETIRED_SYMBOLS[symbol] ?? ""}`,
  );

  return notes.length > 0 ? { code, changed, notes } : { code, changed };
}
