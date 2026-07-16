import {
  resolvePublicUrl,
  type CmssyClientConfig,
  type FetchLike,
} from "./content/content-client";

export type PreflightStatus = "ok" | "fail" | "unknown";

export interface PreflightResult {
  status: PreflightStatus;
  message: string;
  fix?: string;
}

export interface WorkspaceReachableResult extends PreflightResult {
  previewUrl?: string;
}

export interface PreflightConfig extends CmssyClientConfig {
  draftSecret?: string;
  fetch?: FetchLike;
}

const CMSSY_ADMIN_ORIGIN = "https://www.cmssy.io";
const ALLOWED_FRAME_HOSTS = ["cmssy.io", "www.cmssy.io"];
const SETTINGS_PATH = "Settings → Headless";

const PREFLIGHT_SITE_CONFIG_QUERY = `query PreflightSiteConfig($workspaceSlug: String!) {
  public {
    siteConfig(workspaceSlug: $workspaceSlug) {
      previewUrl
      publicSiteUrl
    }
  }
}`;

const DRAFT_SECRET_VALID_QUERY = `query PreflightDraftSecretValid($workspaceSlug: String!, $secret: String!) {
  public {
    draftSecretValid(workspaceSlug: $workspaceSlug, secret: $secret)
  }
}`;

interface PreflightGraphqlError {
  message?: string;
  extensions?: { code?: string };
}

type PostOutcome<T> =
  | { kind: "data"; data: T }
  | { kind: "errors"; errors: PreflightGraphqlError[]; httpStatus: number }
  | { kind: "http"; status: number }
  | { kind: "network"; error: unknown };

async function postPreflightQuery<T>(
  config: PreflightConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<PostOutcome<T>> {
  const doFetch =
    config.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== "function") {
    return {
      kind: "network",
      error: new Error("cmssy: no fetch implementation available"),
    };
  }
  const url = resolvePublicUrl(config);
  let response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    return { kind: "network", error };
  }
  let envelope: { data?: T; errors?: PreflightGraphqlError[] } | null = null;
  try {
    envelope = (await response.json()) as {
      data?: T;
      errors?: PreflightGraphqlError[];
    };
  } catch {
    envelope = null;
  }
  const errors = Array.isArray(envelope?.errors) ? envelope.errors : [];
  if (errors.length > 0) {
    return { kind: "errors", errors, httpStatus: response.status };
  }
  if (!response.ok) {
    return { kind: "http", status: response.status };
  }
  return { kind: "data", data: envelope?.data as T };
}

function errorMessages(errors: PreflightGraphqlError[]): string {
  return errors.map((error) => error.message ?? "GraphQL error").join("; ");
}

function hasErrorCode(errors: PreflightGraphqlError[], code: string): boolean {
  return errors.some((error) => error.extensions?.code === code);
}

function isValidationError(errors: PreflightGraphqlError[]): boolean {
  return errors.some(
    (error) =>
      error.extensions?.code === "GRAPHQL_VALIDATION_FAILED" ||
      /cannot query field/i.test(error.message ?? ""),
  );
}

function isNotFound(
  errors: PreflightGraphqlError[],
  httpStatus: number,
): boolean {
  return (
    httpStatus === 404 ||
    hasErrorCode(errors, "NOT_FOUND") ||
    errors.some((error) => /not found/i.test(error.message ?? ""))
  );
}

export async function checkWorkspaceReachable(
  config: PreflightConfig,
): Promise<WorkspaceReachableResult> {
  const workspace = `${config.org}/${config.workspaceSlug}`;
  const outcome = await postPreflightQuery<{
    public?: {
      siteConfig?: { previewUrl?: string | null } | null;
    } | null;
  }>(config, PREFLIGHT_SITE_CONFIG_QUERY, {
    workspaceSlug: config.workspaceSlug,
  });

  if (outcome.kind === "network") {
    return {
      status: "fail",
      message: `cannot reach the cmssy API at ${resolvePublicUrl(config)}`,
      fix: "check your network connection and CMSSY_API_URL (leave it unset for cmssy cloud)",
    };
  }
  if (
    (outcome.kind === "http" && outcome.status === 429) ||
    (outcome.kind === "errors" &&
      (outcome.httpStatus === 429 ||
        hasErrorCode(outcome.errors, "TOO_MANY_REQUESTS")))
  ) {
    return {
      status: "fail",
      message: `workspace ${workspace} is over its delivery limit (rate limited)`,
      fix: "upgrade the organization plan or wait for the usage window to reset",
    };
  }
  if (outcome.kind === "errors") {
    if (isNotFound(outcome.errors, outcome.httpStatus)) {
      return {
        status: "fail",
        message: `workspace ${workspace} was not found`,
        fix: "check CMSSY_ORG_SLUG and CMSSY_WORKSPACE_SLUG against your dashboard URL",
      };
    }
    return {
      status: "fail",
      message: `the cmssy API rejected the request - ${errorMessages(outcome.errors)}`,
    };
  }
  if (outcome.kind === "http") {
    if (outcome.status === 404) {
      return {
        status: "fail",
        message: `workspace ${workspace} was not found`,
        fix: "check CMSSY_ORG_SLUG and CMSSY_WORKSPACE_SLUG against your dashboard URL",
      };
    }
    return {
      status: "fail",
      message: `the cmssy API responded with HTTP ${outcome.status}`,
    };
  }
  const siteConfig = outcome.data?.public?.siteConfig;
  if (!siteConfig) {
    return {
      status: "fail",
      message: `workspace ${workspace} was not found`,
      fix: "check CMSSY_ORG_SLUG and CMSSY_WORKSPACE_SLUG against your dashboard URL",
    };
  }
  const previewUrl = siteConfig.previewUrl?.trim();
  return {
    status: "ok",
    message: `workspace ${workspace} is reachable`,
    ...(previewUrl ? { previewUrl } : {}),
  };
}

export async function checkDraftSecret(
  config: PreflightConfig,
): Promise<PreflightResult> {
  const secret = config.draftSecret?.trim();
  if (!secret) {
    return {
      status: "fail",
      message: "CMSSY_DRAFT_SECRET is not set",
      fix: `copy the draft secret from ${SETTINGS_PATH}`,
    };
  }
  const outcome = await postPreflightQuery<{
    public?: { draftSecretValid?: boolean } | null;
  }>(config, DRAFT_SECRET_VALID_QUERY, {
    workspaceSlug: config.workspaceSlug,
    secret,
  });

  if (outcome.kind === "network") {
    return {
      status: "unknown",
      message: "could not verify the draft secret (network error)",
    };
  }
  if (outcome.kind === "errors") {
    if (isValidationError(outcome.errors)) {
      return {
        status: "unknown",
        message:
          "this cmssy platform does not support draft secret verification yet",
      };
    }
    return {
      status: "unknown",
      message: `could not verify the draft secret - ${errorMessages(outcome.errors)}`,
    };
  }
  if (outcome.kind === "http") {
    return {
      status: "unknown",
      message: `could not verify the draft secret (HTTP ${outcome.status})`,
    };
  }
  if (outcome.data?.public?.draftSecretValid === true) {
    return { status: "ok", message: "the draft secret is valid" };
  }
  return {
    status: "fail",
    message: "the draft secret does not match this workspace",
    fix: `copy the secret from ${SETTINGS_PATH} into CMSSY_DRAFT_SECRET`,
  };
}

function parseOrigin(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export function checkPreviewUrl(
  previewUrl: string | null | undefined,
  devOrigin: string,
): PreflightResult {
  const trimmed = previewUrl?.trim();
  if (!trimmed) {
    return {
      status: "fail",
      message: "no preview URL is set for this workspace",
      fix: `paste ${devOrigin} into the preview URL field in ${SETTINGS_PATH}`,
    };
  }
  const previewOrigin = parseOrigin(trimmed);
  if (!previewOrigin) {
    return {
      status: "fail",
      message: `the workspace preview URL "${trimmed}" is not a valid URL`,
      fix: `paste ${devOrigin} into the preview URL field in ${SETTINGS_PATH}`,
    };
  }
  const localOrigin = parseOrigin(devOrigin);
  if (previewOrigin === localOrigin) {
    return {
      status: "ok",
      message: `the workspace preview URL matches ${devOrigin}`,
    };
  }
  return {
    status: "fail",
    message: `the workspace preview URL is ${previewOrigin} but your dev server runs at ${devOrigin}`,
    fix: `paste ${devOrigin} into the preview URL field in ${SETTINGS_PATH}`,
  };
}

function frameAncestorSources(cspHeaderValue: string): string[] | null {
  const directive = cspHeaderValue
    .split(";")
    .map((part) => part.trim())
    .find((part) => /^frame-ancestors\b/i.test(part));
  if (!directive) return null;
  return directive
    .split(/\s+/)
    .slice(1)
    .map((source) => source.toLowerCase().replace(/^'|'$/g, ""));
}

function allowsCmssyAdmin(source: string): boolean {
  if (source === "*" || source === "https:") return true;
  const host = source.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split("/")[0];
  if (!host) return false;
  if (host === "*.cmssy.io") return true;
  return ALLOWED_FRAME_HOSTS.includes(host);
}

export function checkFrameAncestors(
  cspHeaderValue: string | null | undefined,
): PreflightResult {
  if (!cspHeaderValue || cspHeaderValue.trim().length === 0) {
    return {
      status: "ok",
      message: "no Content-Security-Policy restricts framing",
    };
  }
  const sources = frameAncestorSources(cspHeaderValue);
  if (sources === null) {
    return {
      status: "ok",
      message: "the Content-Security-Policy has no frame-ancestors directive",
    };
  }
  if (sources.some(allowsCmssyAdmin)) {
    return {
      status: "ok",
      message: "frame-ancestors allows the cmssy editor",
    };
  }
  return {
    status: "fail",
    message: `frame-ancestors (${sources.join(" ") || "'none'"}) blocks the cmssy editor`,
    fix: "add https://cmssy.io https://www.cmssy.io to the frame-ancestors directive (applyCmssyCsp does this for you)",
  };
}

export function buildEditorUrl(
  config: Pick<CmssyClientConfig, "org" | "workspaceSlug">,
  pageId?: string,
): string {
  const base = `${CMSSY_ADMIN_ORIGIN}/dashboard/organizations/${config.org}/workspaces/${config.workspaceSlug}/editor`;
  return pageId ? `${base}?pageId=${encodeURIComponent(pageId)}` : base;
}
