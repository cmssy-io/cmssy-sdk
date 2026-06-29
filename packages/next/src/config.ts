import { MIN_SESSION_SECRET_LENGTH } from "./session";

/**
 * Origin of the cmssy admin/editor that frames your site (postMessage source +
 * CSP `frame-ancestors`). Identical for every workspace on cmssy cloud, so
 * `editorOrigin` defaults to this. Self-hosted admins override it via config.
 */
export const DEFAULT_CMSSY_EDITOR_ORIGIN = "https://www.cmssy.io";

/** Resolves `editorOrigin`, falling back to the cmssy cloud admin when unset. */
export function resolveEditorOrigin(
  editorOrigin: string | string[] | undefined,
): string | string[] {
  if (editorOrigin === undefined) return DEFAULT_CMSSY_EDITOR_ORIGIN;
  if (Array.isArray(editorOrigin)) {
    const cleaned = editorOrigin.filter((o) => o && o.trim().length > 0);
    return cleaned.length > 0 ? cleaned : DEFAULT_CMSSY_EDITOR_ORIGIN;
  }
  return editorOrigin.trim().length > 0
    ? editorOrigin
    : DEFAULT_CMSSY_EDITOR_ORIGIN;
}

export interface CmssyAuthConfig {
  modelSlug: string;
  sessionSecret: string;
}

export interface CmssyNextConfig {
  /**
   * Full GraphQL delivery endpoint. Defaults to the cmssy cloud endpoint
   * (`https://api.cmssy.io/graphql`); set it only for self-hosted / staging.
   */
  apiUrl?: string;
  workspaceSlug: string;
  draftSecret: string;
  /**
   * Origin allowed to frame your app in the editor. Defaults to
   * {@link DEFAULT_CMSSY_EDITOR_ORIGIN}; set it only for self-hosted admins.
   */
  editorOrigin?: string | string[];
  /**
   * Canonical absolute site URL (e.g. https://cmssy.com), used by
   * createCmssyRobots / createCmssySitemap. When omitted the helpers derive the
   * origin from the request `host` header at render time (multi-domain safe).
   */
  siteUrl?: string;
  auth?: CmssyAuthConfig;
  defaultLocale?: string;
  /** All languages enabled on the workspace; exposed to blocks via context.locale.enabled. */
  enabledLocales?: string[];
  resolveLocale?: () => string | Promise<string>;
}

export function assertAuthConfig(config: CmssyNextConfig): CmssyAuthConfig {
  const auth = config.auth;
  if (!auth || typeof auth.modelSlug !== "string" || !auth.modelSlug) {
    throw new Error("cmssy: config.auth.modelSlug is required for auth routes");
  }
  if (
    typeof auth.sessionSecret !== "string" ||
    auth.sessionSecret.length < MIN_SESSION_SECRET_LENGTH
  ) {
    throw new Error(
      `cmssy: config.auth.sessionSecret must be at least ${MIN_SESSION_SECRET_LENGTH} characters`,
    );
  }
  return auth;
}
