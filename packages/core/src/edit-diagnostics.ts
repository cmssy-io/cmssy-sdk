import type { FetchLike } from "./content/content-client";
import { DEFAULT_CMSSY_EDITOR_ORIGINS } from "./config";
import {
  checkDraftSecret,
  checkPreviewUrl,
  checkWorkspaceReachable,
  type PreflightStatus,
} from "./preflight";

export interface EditDiagnosticsConfig {
  apiUrl?: string;
  org?: string;
  workspaceSlug?: string;
  draftSecret?: string;
}

export interface EditDiagnosticsInput {
  config: EditDiagnosticsConfig;
  providedSecret?: string | null;
  devOrigin?: string;
  fetch?: FetchLike;
}

export interface EditDiagnosticsCheck {
  name: string;
  status: PreflightStatus;
  message: string;
  fix?: string;
}

export interface EditDiagnostics {
  workspace: string | null;
  checks: EditDiagnosticsCheck[];
}

const REQUIRED_ENV = [
  ["org", "CMSSY_ORG_SLUG"],
  ["workspaceSlug", "CMSSY_WORKSPACE_SLUG"],
  ["draftSecret", "CMSSY_DRAFT_SECRET"],
] as const;

const SETTINGS_FIX =
  "copy the values from Settings → Headless in the cmssy dashboard, or run npx @cmssy/cli link";

export async function collectEditDiagnostics(
  input: EditDiagnosticsInput,
): Promise<EditDiagnostics> {
  const { config } = input;
  const checks: EditDiagnosticsCheck[] = [];

  const missing = REQUIRED_ENV.filter(([key]) => {
    const value = config[key];
    return !(typeof value === "string" && value.trim());
  }).map(([, env]) => env);
  if (missing.length > 0) {
    checks.push({
      name: "configuration",
      status: "fail",
      message: `missing environment variables: ${missing.join(", ")}`,
      fix: SETTINGS_FIX,
    });
  } else {
    checks.push({
      name: "configuration",
      status: "ok",
      message:
        "CMSSY_ORG_SLUG, CMSSY_WORKSPACE_SLUG and CMSSY_DRAFT_SECRET are set",
    });
  }

  const org = config.org?.trim();
  const workspaceSlug = config.workspaceSlug?.trim();
  const workspace = org && workspaceSlug ? `${org}/${workspaceSlug}` : null;

  let previewUrl: string | undefined;
  if (org && workspaceSlug) {
    const preflight = {
      apiUrl: config.apiUrl,
      org,
      workspaceSlug,
      ...(input.fetch ? { fetch: input.fetch } : {}),
    };
    const reachable = await checkWorkspaceReachable(preflight);
    previewUrl = reachable.previewUrl;
    checks.push({
      name: "workspace",
      status: reachable.status,
      message: reachable.message,
      ...(reachable.fix ? { fix: reachable.fix } : {}),
    });

    const draftSecret = config.draftSecret?.trim();
    if (draftSecret) {
      checks.push(
        await diagnoseSecret(
          { ...preflight, draftSecret },
          input.providedSecret,
        ),
      );
    }
  }

  if (input.devOrigin) {
    const preview = checkPreviewUrl(previewUrl ?? null, input.devOrigin);
    checks.push({
      name: "preview URL",
      status: preview.status,
      message: preview.message,
      ...(preview.fix ? { fix: preview.fix } : {}),
    });
  }

  checks.push({
    name: "frame-ancestors",
    status: "unknown",
    message:
      "CSP blocking cannot be detected from inside the frame - if this page never appears in the editor at all, the likely causes are the preview URL pointing elsewhere or a Content-Security-Policy frame-ancestors that blocks the editor",
    fix: `frame-ancestors must allow ${DEFAULT_CMSSY_EDITOR_ORIGINS.join(" ")} (cmssyCspHeaders / applyCmssyCsp set this for you)`,
  });

  return { workspace, checks };
}

async function diagnoseSecret(
  preflight: {
    apiUrl?: string;
    org: string;
    workspaceSlug: string;
    draftSecret: string;
    fetch?: FetchLike;
  },
  providedSecret: string | null | undefined,
): Promise<EditDiagnosticsCheck> {
  const name = "draft secret";
  if (!providedSecret?.trim()) {
    return {
      name,
      status: "fail",
      message:
        "the request carried no cmssySecret - a bare cmssyEdit=1 is never trusted",
      fix: "open the page from the cmssy editor, which appends the cmssySecret itself",
    };
  }
  const platform = await checkDraftSecret(preflight);
  if (platform.status === "fail") {
    return {
      name,
      status: "fail",
      message: `the provided cmssySecret does not match CMSSY_DRAFT_SECRET, and ${platform.message}`,
      ...(platform.fix ? { fix: platform.fix } : {}),
    };
  }
  if (platform.status === "ok") {
    return {
      name,
      status: "fail",
      message:
        "CMSSY_DRAFT_SECRET matches this workspace, but the cmssySecret sent with the request does not match it",
      fix: "reload the editor so it opens the preview with the current secret",
    };
  }
  return {
    name,
    status: "unknown",
    message: `could not verify against the platform (${platform.message}); the provided cmssySecret failed local verification against CMSSY_DRAFT_SECRET`,
    fix: `make sure CMSSY_DRAFT_SECRET matches Settings → Headless, then reload the editor`,
  };
}

const STATUS_LABEL: Record<PreflightStatus, string> = {
  ok: "OK",
  fail: "FAIL",
  unknown: "?",
};

const DIAGNOSTICS_CSS = `
.cmssy-diagnostics{font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-width:44rem;margin:3rem auto;padding:0 1.5rem;color:#1f2328}
.cmssy-diagnostics h1{font-size:1.15rem;margin:0 0 .5rem}
.cmssy-diagnostics p{margin:.5rem 0}
.cmssy-diagnostics ul{list-style:none;margin:1.5rem 0;padding:0}
.cmssy-diagnostics li{margin:0 0 .75rem;padding:.75rem 1rem;border:1px solid #d0d7de;border-radius:6px}
.cmssy-diagnostics .cmssy-diagnostics-status{font-weight:700;margin-right:.5rem}
.cmssy-diagnostics .cmssy-diagnostics-ok{color:#1a7f37}
.cmssy-diagnostics .cmssy-diagnostics-fail{color:#c5273c}
.cmssy-diagnostics .cmssy-diagnostics-unknown{color:#9a6700}
.cmssy-diagnostics .cmssy-diagnostics-fix{display:block;margin-top:.25rem;opacity:.75}
.cmssy-diagnostics .cmssy-diagnostics-note{opacity:.65}
@media (prefers-color-scheme:dark){
.cmssy-diagnostics{color:#e6edf3}
.cmssy-diagnostics li{border-color:#30363d}
.cmssy-diagnostics .cmssy-diagnostics-ok{color:#3fb950}
.cmssy-diagnostics .cmssy-diagnostics-fail{color:#f85149}
.cmssy-diagnostics .cmssy-diagnostics-unknown{color:#d29922}
}
`.trim();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderEditDiagnostics(diagnostics: EditDiagnostics): string {
  const items = diagnostics.checks
    .map(
      (check) =>
        `<li><span class="cmssy-diagnostics-status cmssy-diagnostics-${check.status}">${STATUS_LABEL[check.status]}</span><strong>${escapeHtml(check.name)}</strong>: ${escapeHtml(check.message)}${
          check.fix
            ? `<span class="cmssy-diagnostics-fix">fix: ${escapeHtml(check.fix)}</span>`
            : ""
        }</li>`,
    )
    .join("");
  const workspaceLine = diagnostics.workspace
    ? `<p>workspace: <strong>${escapeHtml(diagnostics.workspace)}</strong></p>`
    : "";
  return `<style>${DIAGNOSTICS_CSS}</style><main class="cmssy-diagnostics"><h1>cmssy editor diagnostics</h1><p>The editor request could not be verified, so the editor preview cannot render.</p>${workspaceLine}<ul>${items}</ul><p class="cmssy-diagnostics-note">This page is shown in development only - production keeps serving a 404 here.</p></main>`;
}

export function renderEditDiagnosticsDocument(
  diagnostics: EditDiagnostics,
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>cmssy editor diagnostics</title><style>body{margin:0;background:#fff}@media (prefers-color-scheme:dark){body{background:#0d1117}}</style></head><body>${renderEditDiagnostics(diagnostics)}</body></html>`;
}
