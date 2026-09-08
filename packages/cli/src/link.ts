import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildEditorUrl,
  checkDraftSecret,
  checkWorkspaceReachable,
  type PreflightConfig,
  type PreflightResult,
} from "@cmssy/core/preflight";

import {
  CliError,
  fetchDraftSecret,
  fetchMyWorkspaces,
  saveBlockManifest,
  setPreviewUrl,
  type AdminRequestOptions,
  type CliWorkspace,
} from "./admin-client";
import { loadEnvFiles } from "./env-load";
import { mergeEnvContent } from "./env-write";
import { nextSrcPrefix } from "./framework";
import {
  formatDraftPreviewLink,
  formatEditorLink,
  formatResult,
} from "./format";
import type { SiteModuleLoader } from "./site-modules";
import { collectManifest, hasBlocksModule } from "./sync-manifest";

export interface LinkOptions {
  token?: string;
  workspace?: string;
  previewUrl?: string;
}

export interface LinkDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  fetch: typeof globalThis.fetch;
  isTty: boolean;
  ask: (question: string) => Promise<string>;
  load?: SiteModuleLoader;
}

function resolveToken(options: LinkOptions, deps: LinkDeps): string {
  const token = options.token?.trim() || deps.env.CMSSY_API_TOKEN?.trim();
  if (!token) {
    throw new CliError(
      "no API token given",
      "create an API token in the cmssy dashboard (Settings → API Tokens), then run cmssy link --token cs_... or set CMSSY_API_TOKEN",
    );
  }
  return token;
}

function describeWorkspace(workspace: CliWorkspace): string {
  const org = workspace.organizationSlug ?? "?";
  return `${workspace.name} (${org}/${workspace.slug})`;
}

function draftRouteBase(previewUrl: string): string | null {
  try {
    const base = new URL(previewUrl);
    const basePath = base.pathname.replace(/\/+$/, "");
    return `${base.origin}${basePath}/api/draft`;
  } catch {
    return null;
  }
}

export function buildDraftPreviewUrls(
  previewUrl: string,
  draftSecret: string,
): { draftUrl: string; exitUrl: string } | null {
  const base = draftRouteBase(previewUrl);
  if (!base) return null;
  const params = new URLSearchParams({ secret: draftSecret, redirect: "/" });
  return {
    draftUrl: `${base}?${params.toString()}`,
    exitUrl: `${base}?disable=1`,
  };
}

function draftRouteFix(cwd: string): string {
  const path = `${nextSrcPrefix(cwd)}app/api/draft/route.ts`;
  return [
    `add ${path} so Preview can enter draft mode:`,
    '  import { createDraftRoute } from "@cmssy/next/server";',
    '  import { cmssy } from "@/cmssy.config";',
    "  export const GET = createDraftRoute(cmssy);",
  ].join("\n");
}

export async function checkDraftRouteMounted(
  previewUrl: string,
  fetchImpl: typeof globalThis.fetch,
  cwd: string,
): Promise<PreflightResult> {
  const base = draftRouteBase(previewUrl);
  if (!base) {
    return {
      status: "fail",
      message: `the workspace preview URL ${previewUrl} is not a valid URL`,
      fix: "set a valid deployed origin as the preview URL: cmssy link --preview-url https://your-site.com",
    };
  }
  let status: number;
  try {
    status = (
      await fetchImpl(base, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      })
    ).status;
  } catch {
    return {
      status: "unknown",
      message: `could not reach ${base} to check the /api/draft route`,
    };
  }
  if (status === 404) {
    return {
      status: "fail",
      message: `the /api/draft route is not mounted at ${previewUrl} - Preview will 404`,
      fix: draftRouteFix(cwd),
    };
  }
  if (status === 500) {
    return {
      status: "fail",
      message: `the /api/draft route is mounted but misconfigured at ${previewUrl} - the draft secret must be at least 16 characters`,
    };
  }
  return {
    status: "ok",
    message: `the /api/draft route is mounted at ${previewUrl}`,
  };
}

async function selectWorkspace(
  workspaces: CliWorkspace[],
  options: LinkOptions,
  deps: LinkDeps,
): Promise<CliWorkspace> {
  if (workspaces.length === 0) {
    throw new CliError(
      "the token's user has no workspaces",
      "create a workspace in the cmssy dashboard, or use a token from a user who is a member of one",
    );
  }
  const slugs = workspaces
    .map((workspace) => `${workspace.organizationSlug}/${workspace.slug}`)
    .join(", ");
  if (options.workspace) {
    const wanted = options.workspace.trim();
    const match = workspaces.find(
      (workspace) =>
        workspace.slug === wanted ||
        `${workspace.organizationSlug}/${workspace.slug}` === wanted,
    );
    if (!match) {
      throw new CliError(
        `no workspace named "${wanted}"`,
        `pass one of: ${slugs}`,
      );
    }
    return match;
  }
  if (workspaces.length === 1) {
    return workspaces[0] as CliWorkspace;
  }
  if (!deps.isTty) {
    throw new CliError(
      "several workspaces are available and there is no terminal to ask in",
      `pass --workspace <slug> - one of: ${slugs}`,
    );
  }
  deps.log("Which workspace should this app be linked to?");
  workspaces.forEach((workspace, index) => {
    deps.log(`  ${index + 1}. ${describeWorkspace(workspace)}`);
  });
  const answer = await deps.ask(`Workspace [1-${workspaces.length}]: `);
  const choice = Number(answer.trim());
  const selected =
    Number.isInteger(choice) && choice >= 1 && choice <= workspaces.length
      ? workspaces[choice - 1]
      : undefined;
  if (!selected) {
    throw new CliError(
      `"${answer.trim()}" is not a number between 1 and ${workspaces.length}`,
      "run cmssy link again, or pass --workspace <slug>",
    );
  }
  return selected;
}

type PreviewUrlChoice =
  | { kind: "none" }
  | { kind: "deployed"; origin: string }
  | { kind: "local"; origin: string };

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function resolvePreviewUrl(options: LinkOptions): PreviewUrlChoice {
  if (!options.previewUrl) return { kind: "none" };
  let origin: string;
  try {
    origin = new URL(options.previewUrl).origin;
  } catch {
    throw new CliError(
      `"${options.previewUrl}" is not a valid URL`,
      "pass --preview-url with your DEPLOYED site origin, e.g. --preview-url https://example.com",
    );
  }
  return isLocalHost(new URL(origin).hostname)
    ? { kind: "local", origin }
    : { kind: "deployed", origin };
}

async function pushBlockManifest(
  workspace: CliWorkspace,
  admin: AdminRequestOptions,
  deps: LinkDeps,
): Promise<PreflightResult | null> {
  if (!hasBlocksModule(deps.cwd)) return null;
  try {
    const { manifest, blocksPath } = await collectManifest({}, deps);
    await saveBlockManifest(manifest, { ...admin, workspaceId: workspace.id });
    const count = manifest.blocks.length;
    return {
      status: "ok",
      message: `pushed the block manifest from ${blocksPath} (${count} block${count === 1 ? "" : "s"}) - the editor palette knows your blocks before the first deploy`,
    };
  } catch (error) {
    if (error instanceof CliError) {
      const fix =
        error.fix ?? "run cmssy sync-manifest once the blocks module loads";
      return {
        status: "unknown",
        message: `block manifest not pushed: ${error.message} - ${fix}`,
      };
    }
    throw error;
  }
}

function writeEnvLocal(cwd: string, updates: Record<string, string>): void {
  const path = join(cwd, ".env.local");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  writeFileSync(path, mergeEnvContent(existing, updates));
}

export async function runLink(
  options: LinkOptions,
  deps: LinkDeps,
): Promise<number> {
  const { cwd, env, log } = deps;
  try {
    loadEnvFiles(cwd, env);
    const token = resolveToken(options, deps);
    const admin: AdminRequestOptions = {
      token,
      apiUrl: env.CMSSY_API_URL,
      fetch: deps.fetch,
    };

    const workspaces = await fetchMyWorkspaces(admin);
    const workspace = await selectWorkspace(workspaces, options, deps);
    const orgSlug = workspace.organizationSlug;
    if (!orgSlug) {
      throw new CliError(
        `workspace ${workspace.slug} has no organization slug`,
        "open the workspace in the cmssy dashboard once, then run cmssy link again",
      );
    }
    log(
      formatResult({
        status: "ok",
        message: `linking to ${describeWorkspace(workspace)}`,
      }),
    );

    const draftSecret = await fetchDraftSecret({
      ...admin,
      workspaceId: workspace.id,
    });
    log(formatResult({ status: "ok", message: "fetched the draft secret" }));

    const previewUrl = resolvePreviewUrl(options);
    if (previewUrl.kind === "deployed") {
      await setPreviewUrl(previewUrl.origin, {
        ...admin,
        workspaceId: workspace.id,
      });
      log(
        formatResult({
          status: "ok",
          message: `set the workspace preview URL to ${previewUrl.origin}`,
        }),
      );
    } else if (previewUrl.kind === "local") {
      log(
        formatResult({
          status: "unknown",
          message: `${previewUrl.origin} is your machine, not the DEPLOYED site every editor in the workspace previews - the shared preview URL was left unchanged; open the editor, toggle dev mode and enter ${previewUrl.origin} there (per user, nothing shared), and pass --preview-url <deployed origin> once the site is live`,
        }),
      );
    } else {
      log(
        formatResult({
          status: "unknown",
          message:
            "preview URL left unchanged - pass --preview-url <deployed origin> to set it; for localhost use the editor dev-mode switch",
        }),
      );
    }

    writeEnvLocal(cwd, {
      CMSSY_ORG_SLUG: orgSlug,
      CMSSY_WORKSPACE_SLUG: workspace.slug,
      CMSSY_DRAFT_SECRET: draftSecret,
    });
    env.CMSSY_ORG_SLUG = orgSlug;
    env.CMSSY_WORKSPACE_SLUG = workspace.slug;
    env.CMSSY_DRAFT_SECRET = draftSecret;
    log(
      formatResult({
        status: "ok",
        message:
          "wrote CMSSY_ORG_SLUG, CMSSY_WORKSPACE_SLUG and CMSSY_DRAFT_SECRET to .env.local",
      }),
    );

    const manifestResult = await pushBlockManifest(workspace, admin, deps);
    if (manifestResult) log(formatResult(manifestResult));

    const preflight: PreflightConfig = {
      apiUrl: env.CMSSY_API_URL,
      org: orgSlug,
      workspaceSlug: workspace.slug,
      draftSecret,
      fetch: deps.fetch as unknown as PreflightConfig["fetch"],
    };
    const reachable = await checkWorkspaceReachable(preflight);
    log(formatResult(reachable));
    const secretResult = await checkDraftSecret(preflight);
    log(formatResult(secretResult));

    let draftRouteResult: PreflightResult | null = null;
    if (reachable.previewUrl) {
      draftRouteResult = await checkDraftRouteMounted(
        reachable.previewUrl,
        deps.fetch,
        cwd,
      );
      log(formatResult(draftRouteResult));
    }

    log(formatEditorLink(buildEditorUrl(preflight)));
    if (
      reachable.previewUrl &&
      secretResult.status !== "fail" &&
      draftRouteResult?.status !== "fail"
    ) {
      const draftUrls = buildDraftPreviewUrls(
        reachable.previewUrl,
        draftSecret,
      );
      if (draftUrls) {
        log(formatDraftPreviewLink(draftUrls.draftUrl, draftUrls.exitUrl));
      }
    }

    const failed =
      reachable.status === "fail" ||
      secretResult.status === "fail" ||
      draftRouteResult?.status === "fail";
    return failed ? 1 : 0;
  } catch (error) {
    if (error instanceof CliError) {
      log(
        formatResult({
          status: "fail",
          message: error.message,
          fix: error.fix,
        }),
      );
      return 1;
    }
    log(
      formatResult({
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return 1;
  }
}
