import type { CmssyLayout } from "./layout";

export const DEFAULT_CMSSY_EDITOR_ORIGINS = [
  "https://cmssy.io",
  "https://www.cmssy.io",
];

function parseEditorOrigin(
  raw: string | string[] | undefined,
): string | string[] | undefined {
  if (raw === undefined) return undefined;
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (parts.length === 0) return undefined;
  if (Array.isArray(raw)) return parts;
  return parts.length === 1 ? parts[0] : parts;
}

export function isDevelopment(): boolean {
  return (
    typeof process !== "undefined" && process.env.NODE_ENV === "development"
  );
}

function rejectWildcardOutsideDevelopment(value: string | string[]): void {
  const origins = Array.isArray(value) ? value : [value];
  if (origins.includes("*") && !isDevelopment()) {
    throw new Error(
      "cmssy: editorOrigin '*' is only allowed in development; set a concrete editor origin (e.g. https://cmssy.io) for production",
    );
  }
}

export function resolveEditorOrigin(
  editorOrigin: string | string[] | undefined,
): string | string[] {
  if (editorOrigin !== undefined) {
    const explicit = parseEditorOrigin(editorOrigin);
    if (explicit === undefined) return DEFAULT_CMSSY_EDITOR_ORIGINS;
    rejectWildcardOutsideDevelopment(explicit);
    return explicit;
  }
  const fromEnv =
    typeof process !== "undefined"
      ? parseEditorOrigin(process.env.CMSSY_EDITOR_ORIGIN)
      : undefined;
  if (fromEnv === undefined) {
    return isDevelopment() ? "*" : DEFAULT_CMSSY_EDITOR_ORIGINS;
  }
  rejectWildcardOutsideDevelopment(fromEnv);
  return fromEnv;
}

export interface CmssyConfig<L extends CmssyLayout = CmssyLayout> {
  apiUrl?: string;
  org: string;
  workspaceSlug: string;
  draftSecret: string;
  devToken?: string;
  editorOrigin?: string | string[];
  siteUrl?: string;
  resolveLocale?: () => string | Promise<string>;
  layout?: L;
}

export type CmssyRegionOf<C extends CmssyConfig> = NonNullable<
  C["layout"]
>["regions"][number]["id"];

export type CmssyEnvConfig<L extends CmssyLayout = CmssyLayout> = Omit<
  CmssyConfig<L>,
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

export function defineCmssyConfig<L extends CmssyLayout = CmssyLayout>(
  config: CmssyEnvConfig<L>,
): CmssyConfig<L> {
  const resolved: CmssyEnvConfig<L> = { ...config };
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
  return resolved as CmssyConfig<L>;
}
