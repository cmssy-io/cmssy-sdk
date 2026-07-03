import { MIN_SESSION_SECRET_LENGTH } from "./session";

export const DEFAULT_CMSSY_EDITOR_ORIGINS = [
  "https://cmssy.io",
  "https://www.cmssy.io",
];

function parseEditorOriginEnv(
  raw: string | undefined,
): string | string[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : parts;
}

export function isDevelopment(): boolean {
  return (
    typeof process !== "undefined" && process.env.NODE_ENV === "development"
  );
}

export function resolveEditorOrigin(
  editorOrigin: string | string[] | undefined,
): string | string[] {
  const value =
    editorOrigin ??
    (typeof process !== "undefined"
      ? parseEditorOriginEnv(process.env.CMSSY_EDITOR_ORIGIN)
      : undefined);
  if (value === undefined) {
    return isDevelopment() ? "*" : DEFAULT_CMSSY_EDITOR_ORIGINS;
  }
  if (Array.isArray(value)) {
    const cleaned = value.filter((o) => o && o.trim().length > 0);
    return cleaned.length > 0 ? cleaned : DEFAULT_CMSSY_EDITOR_ORIGINS;
  }
  return value.trim().length > 0 ? value : DEFAULT_CMSSY_EDITOR_ORIGINS;
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
  devToken?: string;
  /**
   * When true (and NODE_ENV=development with a devToken), the app serves the
   * caller's dev-draft overlay on every request without the `?cmssyDev` flag -
   * for local development against your own dev drafts. Ignored in production.
   */
  devPreview?: boolean;
  /**
   * Origin allowed to frame your app in the editor. Defaults to
   * {@link DEFAULT_CMSSY_EDITOR_ORIGINS}; set it only for self-hosted admins.
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
