import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve as resolvePath } from "node:path";

import { DEFAULT_CMSSY_API_URL } from "@cmssy/core";

import { CliError } from "./admin-client";
import { loadEnvFiles } from "./env-load";
import {
  generateModelTypes,
  type ModelDefinition,
} from "./model-types";
import {
  DEFAULT_OPERATIONS_OUT,
  generateOperationsFile,
  operationNames,
} from "./operations-file";

const DEFAULT_OUT = "cmssy/models.ts";

const SITE_CONFIG_QUERY = `query CliSiteConfig($workspaceSlug: String!) {
  public { siteConfig(workspaceSlug: $workspaceSlug) { workspaceId } }
}`;

const DEFINITIONS_QUERY = `query CliModelDefinitions($workspaceId: String!) {
  public {
    model {
      definitions(workspaceId: $workspaceId) {
        slug
        name
        description
        displayField
        fields {
          key
          label
          description
          type
          required
          localized
          multiple
          hidden
          options
          relationTo
          relationType
          fields
          itemType
          itemFields
        }
      }
    }
  }
}`;

export interface TypesOptions {
  out?: string;
  org?: string;
  workspace?: string;
  check?: boolean;
  operationsOut?: string;
  noOperations?: boolean;
}

export interface TypesDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  log: (line: string) => void;
  fetch: typeof globalThis.fetch;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function publicEndpoint(
  env: Record<string, string | undefined>,
  org: string,
  workspace: string,
): string {
  const apiUrl = env.CMSSY_API_URL?.trim() || DEFAULT_CMSSY_API_URL;
  const base = apiUrl.replace(/\/graphql\/?$/, "").replace(/\/+$/, "");
  return `${base}/public/${org}/${workspace}/graphql`;
}

async function request<T>(
  deps: TypesDeps,
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await deps.fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new CliError(
      `could not reach ${endpoint}`,
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!response.ok) {
    throw new CliError(
      `the delivery API answered ${response.status}`,
      "check CMSSY_ORG_SLUG and CMSSY_WORKSPACE_SLUG - they form the delivery path",
    );
  }
  const body = (await response.json()) as GraphqlResponse<T>;
  if (body.errors?.length) {
    throw new CliError(
      "the delivery API rejected the query",
      body.errors.map((error) => error.message).join("; "),
    );
  }
  if (!body.data) throw new CliError("the delivery API returned no data");
  return body.data;
}

function describeDrift(previous: string, next: string): string[] {
  const declared = (source: string, pattern: RegExp) =>
    new Set([...source.matchAll(pattern)].map((match) => match[1] ?? ""));

  const body = (source: string) => source.split("/** Every model in the")[0] ?? source;
  const models = /export interface (\w+)Data/g;
  const fields = /^\s{2}(\w+)\??:/gm;

  const lines: string[] = [];
  const report = (label: string, before: Set<string>, after: Set<string>) => {
    const added = [...after].filter((name) => !before.has(name));
    const removed = [...before].filter((name) => !after.has(name));
    if (added.length) lines.push(`+ ${label}: ${added.join(", ")}`);
    if (removed.length) lines.push(`- ${label}: ${removed.join(", ")}`);
  };

  report("models", declared(previous, models), declared(next, models));
  report("fields", declared(body(previous), fields), declared(body(next), fields));
  return lines.length ? lines : ["the generated output differs"];
}

function resolve(
  value: string | undefined,
  fromEnv: string | undefined,
  variable: string,
): string {
  const resolved = value?.trim() || fromEnv?.trim();
  if (!resolved) {
    throw new CliError(
      `no workspace to read: ${variable} is not set`,
      "run cmssy link first, or pass --org / --workspace",
    );
  }
  return resolved;
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".git",
  ".turbo",
  ".vercel",
]);
const ANY_OPERATION_NAME = /^\s*(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/gm;

function existingOperationNames(
  cwd: string,
  skipPath: string,
): Map<string, string> {
  const found = new Map<string, string>();
  let entries: string[];
  try {
    entries = readdirSync(cwd, { recursive: true }) as unknown as string[];
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.endsWith(".graphql")) continue;
    if (entry.split(/[\\/]/).some((part) => SKIP_DIRS.has(part))) continue;
    const full = resolvePath(cwd, entry);
    if (full === skipPath) continue;
    let source: string;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(ANY_OPERATION_NAME)) {
      const name = match[1];
      if (name && !found.has(name)) found.set(name, entry);
    }
  }
  return found;
}

function syncOperations(options: TypesOptions, deps: TypesDeps): number {
  if (options.noOperations) return 0;

  const requested = options.operationsOut?.trim() || DEFAULT_OPERATIONS_OUT;
  const outPath = resolvePath(deps.cwd, requested);
  const inside = relative(deps.cwd, outPath);
  const shown = inside && !inside.startsWith("..") ? inside : outPath;
  const source = generateOperationsFile();

  let previous: string | null = null;
  try {
    previous = readFileSync(outPath, "utf8");
  } catch {
    previous = null;
  }

  const existing = existingOperationNames(deps.cwd, outPath);
  const clashes = operationNames()
    .map((name) => ({ name, file: existing.get(name) }))
    .filter((clash): clash is { name: string; file: string } => !!clash.file);
  if (clashes.length > 0) {
    deps.log(
      `cmssy: ${shown} would collide with operations this app already declares`,
    );
    for (const clash of clashes) {
      deps.log(`  ${clash.name} - already in ${clash.file}`);
    }
    deps.log(
      "  delete those documents to use the vendored ones, or pass --no-operations to keep yours",
    );
    return 1;
  }

  if (previous === source) return 0;

  if (options.check) {
    deps.log(
      previous === null
        ? `cmssy: ${shown} is missing - run \`cmssy types\` and commit it`
        : `cmssy: ${shown} is out of date with this CLI's delivery operations`,
    );
    deps.log("  run `cmssy types` and commit the result");
    return 1;
  }

  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, source);
  } catch (error) {
    throw new CliError(
      `could not write ${shown}: ${(error as Error).message}`,
      "check the path is writable, or pass --operations-out",
    );
  }
  const names = operationNames();
  deps.log(`cmssy: wrote ${shown} - ${names.length} operations`);
  deps.log(`  ${names.join(", ")}`);
  return 0;
}

export async function runTypes(
  options: TypesOptions,
  deps: TypesDeps,
): Promise<number> {
  let operationsStatus = 0;
  try {
    loadEnvFiles(deps.cwd, deps.env);
    operationsStatus = syncOperations(options, deps);
    const org = resolve(options.org, deps.env.CMSSY_ORG_SLUG, "CMSSY_ORG_SLUG");
    const workspace = resolve(
      options.workspace,
      deps.env.CMSSY_WORKSPACE_SLUG,
      "CMSSY_WORKSPACE_SLUG",
    );
    const endpoint = publicEndpoint(deps.env, org, workspace);

    const site = await request<{
      public: { siteConfig: { workspaceId: string } | null };
    }>(deps, endpoint, SITE_CONFIG_QUERY, { workspaceSlug: workspace });
    const workspaceId = site.public.siteConfig?.workspaceId;
    if (!workspaceId) {
      throw new CliError(
        `workspace "${org}/${workspace}" was not found`,
        "check the slugs under Settings → Headless",
      );
    }

    const result = await request<{
      public: { model: { definitions: ModelDefinition[] } };
    }>(deps, endpoint, DEFINITIONS_QUERY, { workspaceId });
    const models = result.public.model.definitions;

    if (models.length === 0) {
      deps.log(
        `cmssy: the "${workspace}" workspace has no models yet - nothing to generate`,
      );
      return operationsStatus;
    }

    const requested = options.out?.trim() || DEFAULT_OUT;
    const outPath = resolvePath(deps.cwd, requested);
    const inside = relative(deps.cwd, outPath);
    const shown = inside && !inside.startsWith("..") ? inside : outPath;
    const source = generateModelTypes(models, { workspace });

    let previous: string | null = null;
    try {
      previous = readFileSync(outPath, "utf8");
    } catch {
      previous = null;
    }
    if (previous === source) {
      deps.log(`cmssy: ${shown} is up to date`);
      return operationsStatus;
    }

    if (options.check) {
      deps.log(
        previous === null
          ? `cmssy: ${shown} is missing - run \`cmssy types\` and commit it`
          : `cmssy: ${shown} is out of date with the "${workspace}" workspace`,
      );
      if (previous !== null) {
        for (const line of describeDrift(previous, source)) deps.log(`  ${line}`);
      }
      deps.log("  run `cmssy types` and commit the result");
      return 1;
    }

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, source);

    const fieldCount = models.reduce(
      (total, model) => total + model.fields.length,
      0,
    );
    deps.log(
      `cmssy: wrote ${shown} - ${models.length} model${
        models.length === 1 ? "" : "s"
      }, ${fieldCount} field${fieldCount === 1 ? "" : "s"}`,
    );
    deps.log(
      `  ${models.map((model) => model.slug).join(", ")}`,
    );
    return operationsStatus;
  } catch (error) {
    if (error instanceof CliError) {
      deps.log(`cmssy: ${error.message}`);
      if (error.fix) deps.log(`  ${error.fix}`);
      return 1;
    }
    throw error;
  }
}
