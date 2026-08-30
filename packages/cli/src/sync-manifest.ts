import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  buildBlockManifest,
  type BlockManifest,
  type BlockManifestSource,
  type CmssyLayout,
} from "@cmssy/core";

import {
  CliError,
  fetchBlockManifestHash,
  fetchMyWorkspaces,
  saveBlockManifest,
  type CliWorkspace,
} from "./admin-client";
import { loadEnvFiles } from "./env-load";
import { loadSiteModule, type SiteModuleLoader } from "./site-modules";

const BLOCKS_CANDIDATES = [
  "cmssy/blocks.ts",
  "cmssy/blocks.tsx",
  "src/cmssy/blocks.ts",
  "src/cmssy/blocks.tsx",
  "app/cmssy/blocks.ts",
  "app/cmssy/blocks.tsx",
];

const CONFIG_CANDIDATES = [
  "cmssy.config.ts",
  "cmssy.config.mts",
  "src/cmssy.config.ts",
  "src/cmssy.config.mts",
  "app/cmssy.config.ts",
];

export const SYNC_MANIFEST_USAGE = [
  "  cmssy sync-manifest [--blocks <path>] [--config <path>] [--token <cs_...>]",
  "                      [--org <slug>] [--workspace <slug>] [--dry-run] [--help]",
];

export interface SyncManifestOptions {
  help?: boolean;
  blocks?: string;
  config?: string;
  token?: string;
  org?: string;
  workspace?: string;
  dryRun?: boolean;
}

export interface SyncManifestDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  fetch: typeof globalThis.fetch;
  load?: SiteModuleLoader;
}

function findModule(
  cwd: string,
  requested: string | undefined,
  candidates: string[],
  flag: string,
): string {
  if (requested?.trim()) {
    const path = requested.trim();
    if (!existsSync(isAbsolute(path) ? path : join(cwd, path))) {
      throw new CliError(`${path} does not exist`, `check the ${flag} path`);
    }
    return path;
  }
  const found = candidates.find((candidate) =>
    existsSync(join(cwd, candidate)),
  );
  if (!found) {
    throw new CliError(
      `no ${candidates[0]} found in ${cwd}`,
      `looked for ${candidates.join(", ")} - pass ${flag} <path> to name the file`,
    );
  }
  return found;
}

function isBlockSource(value: unknown): value is BlockManifestSource {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as BlockManifestSource).type === "string" &&
    !!(value as BlockManifestSource).props &&
    typeof (value as BlockManifestSource).props === "object"
  );
}

function readBlocks(
  module: Record<string, unknown>,
  path: string,
): { blocks: BlockManifestSource[]; category?: string } {
  const exported = module.blocks ?? module.default;
  if (!Array.isArray(exported)) {
    throw new CliError(
      `${path} does not export a \`blocks\` array`,
      "export const blocks = [heroBlock, ...] - the same list the app renders from",
    );
  }
  const invalid = exported.findIndex((block) => !isBlockSource(block));
  if (invalid !== -1) {
    throw new CliError(
      `${path}: blocks[${invalid}] is not a block definition`,
      "every entry must come from defineBlock({ type, props, component })",
    );
  }
  const category =
    typeof module.category === "string" ? module.category : undefined;
  return { blocks: exported as BlockManifestSource[], category };
}

function isLayout(value: unknown): value is CmssyLayout {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as CmssyLayout).regions)
  );
}

function readConfig(
  module: Record<string, unknown>,
  path: string,
): { layout: CmssyLayout | null; org?: string; workspaceSlug?: string } {
  const cmssy = module.cmssy;
  const site =
    cmssy && typeof cmssy === "object"
      ? (cmssy as { org?: unknown; workspaceSlug?: unknown; layout?: unknown })
      : null;
  const layout = isLayout(module.layout)
    ? module.layout
    : isLayout(site?.layout)
      ? site.layout
      : null;
  if (!layout && module.layout !== undefined) {
    throw new CliError(
      `${path} exports \`layout\`, but it is not a defineCmssyLayout() result`,
      "export const layout = defineCmssyLayout({ regions: [...] })",
    );
  }
  return {
    layout,
    org: typeof site?.org === "string" ? site.org : undefined,
    workspaceSlug:
      typeof site?.workspaceSlug === "string" ? site.workspaceSlug : undefined,
  };
}

function resolveSlug(
  flag: string | undefined,
  fromConfig: string | undefined,
  fromEnv: string | undefined,
  variable: string,
  flagName: string,
): string {
  const value = flag?.trim() || fromConfig?.trim() || fromEnv?.trim();
  if (!value) {
    throw new CliError(
      `no workspace to push to: ${variable} is not set`,
      `run cmssy link first, or pass ${flagName} <slug>`,
    );
  }
  return value;
}

function resolveToken(
  options: SyncManifestOptions,
  env: Record<string, string | undefined>,
): string {
  const token = options.token?.trim() || env.CMSSY_API_TOKEN?.trim();
  if (!token) {
    throw new CliError(
      "no API token given",
      "create an API token in the cmssy dashboard (Settings → API Tokens) and set CMSSY_API_TOKEN in the deploy environment, or pass --token cs_...",
    );
  }
  return token;
}

function matchWorkspace(
  workspaces: CliWorkspace[],
  org: string,
  slug: string,
): CliWorkspace {
  const match = workspaces.find(
    (workspace) =>
      workspace.slug === slug && (workspace.organizationSlug ?? null) === org,
  );
  if (!match) {
    const known = workspaces
      .map(
        (workspace) => `${workspace.organizationSlug ?? "?"}/${workspace.slug}`,
      )
      .join(", ");
    throw new CliError(
      `the token's user is not a member of ${org}/${slug}`,
      known
        ? `the token can reach: ${known} - check CMSSY_ORG_SLUG and CMSSY_WORKSPACE_SLUG`
        : "the token's user belongs to no workspace - check the token",
    );
  }
  return match;
}

function describe(manifest: BlockManifest): string[] {
  const lines = [
    `  blocks: ${manifest.blocks.map((block) => block.type).join(", ") || "-"}`,
  ];
  if (!manifest.regions) {
    lines.push("  regions: none declared - the stored regions are kept");
    return lines;
  }
  const regions = manifest.regions.map((region) => {
    const settings = region.settings ? Object.keys(region.settings) : [];
    return settings.length
      ? `${region.id} (${settings.join(", ")})`
      : region.id;
  });
  lines.push(`  regions: ${regions.join(", ") || "-"}`);
  return lines;
}

export async function collectManifest(
  options: SyncManifestOptions,
  deps: SyncManifestDeps,
): Promise<{
  manifest: BlockManifest;
  blocksPath: string;
  configPath: string;
  org?: string;
  workspaceSlug?: string;
}> {
  const load = deps.load ?? loadSiteModule;
  const blocksPath = findModule(
    deps.cwd,
    options.blocks,
    BLOCKS_CANDIDATES,
    "--blocks",
  );
  const configPath = findModule(
    deps.cwd,
    options.config,
    CONFIG_CANDIDATES,
    "--config",
  );
  const { blocks, category } = readBlocks(
    await load(deps.cwd, blocksPath),
    blocksPath,
  );
  const config = readConfig(await load(deps.cwd, configPath), configPath);
  if (blocks.length === 0) {
    throw new CliError(
      `${blocksPath} exports an empty \`blocks\` array`,
      "register at least one block - cmssy add block <name>",
    );
  }
  const manifest = buildBlockManifest(blocks, {
    category,
    regions: config.layout?.regions,
  });
  return {
    manifest,
    blocksPath,
    configPath,
    org: config.org,
    workspaceSlug: config.workspaceSlug,
  };
}

export async function runSyncManifest(
  options: SyncManifestOptions,
  deps: SyncManifestDeps,
): Promise<number> {
  if (options.help) {
    deps.log("usage:");
    for (const line of SYNC_MANIFEST_USAGE) deps.log(line);
    return 0;
  }
  try {
    loadEnvFiles(deps.cwd, deps.env);
    const collected = await collectManifest(options, deps);
    const { manifest } = collected;

    if (options.dryRun) {
      deps.log(JSON.stringify(manifest, null, 2));
      return 0;
    }

    const token = resolveToken(options, deps.env);
    const org = resolveSlug(
      options.org,
      collected.org,
      deps.env.CMSSY_ORG_SLUG,
      "CMSSY_ORG_SLUG",
      "--org",
    );
    const slug = resolveSlug(
      options.workspace,
      collected.workspaceSlug,
      deps.env.CMSSY_WORKSPACE_SLUG,
      "CMSSY_WORKSPACE_SLUG",
      "--workspace",
    );
    const request = {
      token,
      apiUrl: deps.env.CMSSY_API_URL,
      fetch: deps.fetch,
    };
    const workspace = matchWorkspace(
      await fetchMyWorkspaces(request),
      org,
      slug,
    );
    const scoped = { ...request, workspaceId: workspace.id };
    const before = await fetchBlockManifestHash(scoped);
    const saved = await saveBlockManifest(manifest, scoped);
    const unchanged = before === saved.hash;

    const count = `${manifest.blocks.length} block${
      manifest.blocks.length === 1 ? "" : "s"
    }${
      manifest.regions
        ? ` and ${manifest.regions.length} region${
            manifest.regions.length === 1 ? "" : "s"
          }`
        : ""
    }`;
    deps.log(
      unchanged
        ? `cmssy: ${org}/${slug} already has this manifest - ${count} unchanged (${collected.blocksPath}, ${collected.configPath})`
        : `cmssy: pushed ${count} to ${org}/${slug} (${collected.blocksPath}, ${collected.configPath})`,
    );
    for (const line of describe(manifest)) deps.log(line);
    deps.log(
      unchanged
        ? `  manifest ${saved.hash.slice(0, 12)} - last updated ${saved.updatedAt}`
        : `  manifest ${saved.hash.slice(0, 12)} - updated ${saved.updatedAt}`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      deps.log(`cmssy: ${error.message}`);
      if (error.fix) deps.log(`  ${error.fix}`);
      return 1;
    }
    throw error;
  }
}
