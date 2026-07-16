import type { CmssyAuthConfig } from "@cmssy/types";
import { MIN_SESSION_SECRET_LENGTH } from "./session";

// CmssyAuthConfig lives in @cmssy/types; re-exported for consumers.
export type { CmssyAuthConfig };

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

export interface CmssyConfig {
  /**
   * Full GraphQL delivery endpoint. Defaults to the cmssy cloud endpoint
   * (`https://api.cmssy.io/graphql`); set it only for self-hosted / staging.
   */
  apiUrl?: string;
  /** Organization slug - part of the org-scoped delivery path. */
  org: string;
  workspaceSlug: string;
  draftSecret: string;
  /**
   * A cmssy API token (`cs_…`) that opts this app into the editor-controlled dev
   * preview. In development only, the SDK sends it on every page fetch so the
   * backend can resolve the token's user and honour that user's dev-preview flag
   * (toggled from the editor's dev-mode switch): flag on + a saved dev draft ⇒
   * the draft overlay renders, otherwise published content. Server-only (never
   * reaches the client); ignored outside development. See the Quickstart
   * "Dev preview" section.
   */
  devToken?: string;
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
  /**
   * Fallback locale resolver for a site whose URLs carry no language (e.g. a
   * cookie or Accept-Language strategy). The workspace site config remains the
   * source of truth for the default and enabled languages.
   */
  resolveLocale?: () => string | Promise<string>;
}

/**
 * Env-shaped input for {@link defineCmssyConfig}: the required string fields are
 * widened to `string | undefined` so a config can pass `process.env.*` straight
 * through without a `?? ""` fallback (which would mask a missing value as an
 * empty string) or a cast.
 */
export type CmssyEnvConfig = Omit<
  CmssyConfig,
  "org" | "workspaceSlug" | "draftSecret"
> & {
  org?: string;
  workspaceSlug?: string;
  draftSecret?: string;
};

const REQUIRED_CONFIG_ENV = [
  ["org", "CMSSY_ORG_SLUG"],
  ["workspaceSlug", "CMSSY_WORKSPACE_SLUG"],
  ["draftSecret", "CMSSY_DRAFT_SECRET"],
] as const;

/**
 * Validates an env-sourced config and returns a strictly-typed
 * {@link CmssyConfig}. Pass raw `process.env.*` values; this throws a clear,
 * actionable error listing any missing required variables (rendered by the
 * Next.js error overlay / boundary), so the app fails fast instead of running
 * with silently-empty config.
 */
export function defineCmssyConfig(config: CmssyEnvConfig): CmssyConfig {
  const resolved: CmssyEnvConfig = { ...config };
  const missing: string[] = [];
  for (const [key, env] of REQUIRED_CONFIG_ENV) {
    const value = config[key];
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) {
      resolved[key] = trimmed;
    } else {
      missing.push(`${env} (config.${key})`);
    }
  }
  if (missing.length > 0) {
    // In the browser these variables are ALWAYS missing - they are server-side
    // env, and Next does not ship them. So this is not a configuration mistake
    // at all: a client component pulled a VALUE out of a module that reads the
    // config, dragging it into the browser bundle. Saying "set your env vars"
    // here sends the developer to fix something that is already correct.
    if (typeof window !== "undefined") {
      throw new Error(
        "cmssy: the config was evaluated in the browser, so it cannot see the " +
          "server's environment variables.\n\n" +
          "This is an import problem, not a config problem: client-side code " +
          "imported a VALUE from a module that reads the cmssy config - " +
          "directly, or through a helper sitting next to one.\n\n" +
          "Fix it by importing types only (they are erased at build time), or by " +
          "moving the value into a module that does not touch the config.",
      );
    }
    throw new Error(
      `cmssy: missing required configuration:\n  - ${missing.join(
        "\n  - ",
      )}\nSet the listed environment variables (e.g. in .env.local) and restart the dev server.`,
    );
  }
  return resolved as CmssyConfig;
}

export function assertAuthConfig(config: CmssyConfig): CmssyAuthConfig {
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
