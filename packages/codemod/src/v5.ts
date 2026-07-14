export const RENAMES: Record<string, string> = {
  CmssyNextConfig: "CmssyConfig",
  clearCartWorkspaceIdCache: "clearWorkspaceIdCache",
};

export const SERVER_SYMBOLS = new Set([
  "createCmssyPage",
  "createCmssyEditPage",
  "createCmssyNotFound",
  "CmssyChrome",
  "CmssyChromeProps",
  "CreateCmssyNotFoundOptions",
  "buildCmssyMetadata",
  "BuildCmssyMetadataOptions",
  "createCmssyRobots",
  "CreateCmssyRobotsOptions",
  "createCmssySitemap",
  "CreateCmssySitemapOptions",
  "CmssySitemapContext",
  "createCmssyAuthRoute",
  "CmssyAuthRouteHandlers",
  "createCmssyCartRoute",
  "CmssyCartRouteHandlers",
  "CMSSY_CART_COOKIE",
  "createCmssyOrdersRoute",
  "CmssyOrdersRouteHandlers",
  "createDraftRoute",
  "CmssyDraftRouteConfig",
  "getCmssyUser",
  "getCmssyAccessToken",
  "getCmssyLocale",
  "isCmssyEditMode",
  "fetchProducts",
  "fetchProduct",
]);

export const MIDDLEWARE_SYMBOLS = new Set([
  "createCmssyProxy",
  "cmssyProxyMatcher",
  "CmssyProxyOptions",
  "cmssyEditRewrite",
  "createCmssyEditMiddleware",
  "CMSSY_EDIT_PATH_PREFIX",
  "createCmssyLocaleMiddleware",
  "resolveLocaleFromPathname",
  "createCmssyAuthMiddleware",
  "CmssyAuthMiddleware",
  "isCmssyEditRequest",
  "applyCmssyCsp",
  "cmssyCspHeaders",
  "CmssyCspOptions",
  "localeForPathname",
]);

export const CLIENT_SYMBOLS = new Set([
  "CmssyLink",
  "CmssyLinkProps",
  "CmssyLocaleProvider",
  "CmssyLocaleProviderProps",
  "useCmssyLocale",
]);

// Symbols @cmssy/next used to re-export that are not Next's at all - a webhook
// verifier, a session cookie, an order lookup. They live in @cmssy/core now and
// nowhere else, so leaving them on the root entry is not a smaller change: it is
// a broken build.
export const CORE_SYMBOLS = new Set([
  "resolveApiUrl",
  "DEFAULT_CMSSY_API_URL",
  "evaluateFieldConditionGroup",
  "FieldCondition",
  "FieldConditionGroup",
  "FieldConditionLogic",
  "splitCmssyLocale",
  "sealSession",
  "openSession",
  "isAccessExpired",
  "sessionCookieOptions",
  "SESSION_MAX_AGE_SECONDS",
  "CmssySessionPayload",
  "CmssySessionUser",
  "SessionCookieOptions",
  "verifyCmssyWebhook",
  "CmssyWebhookError",
  "CmssyWebhookEvent",
  "CmssyWebhookOrder",
  "VerifyCmssyWebhookOptions",
  "fetchOrderByToken",
  "FetchOrderByTokenOptions",
  "MyOrdersResult",
  "FetchProductsOptions",
  "FetchProductOptions",
  "CmssyProductPage",
  "CmssyStockState",
]);

const ENTRY_FOR = (symbol: string): string => {
  if (SERVER_SYMBOLS.has(symbol)) return "@cmssy/next/server";
  if (MIDDLEWARE_SYMBOLS.has(symbol)) return "@cmssy/next/middleware";
  if (CLIENT_SYMBOLS.has(symbol)) return "@cmssy/next/client";
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

export interface TransformResult {
  code: string;
  changed: boolean;
}

/**
 * Rewrites 4.x imports onto the 5.0 entries. One import can fan out into
 * several - a file that pulled the proxy and the page factory from the same
 * place was importing across two runtimes, which is exactly the mistake the
 * split exists to prevent.
 */
export function transform(source: string): TransformResult {
  let changed = false;

  let code = source.replace(IMPORT, (match, typeOnly, body: string) => {
    const specifiers = parseSpecifiers(body).map(applyRenames);
    if (specifiers.length === 0) return match;

    const byEntry = new Map<string, string[]>();
    for (const specifier of specifiers) {
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

  return { code, changed };
}
