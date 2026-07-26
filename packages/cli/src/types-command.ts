import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve as resolvePath } from "node:path";

import { DEFAULT_CMSSY_API_URL } from "@cmssy/core";

import { CliError } from "./admin-client";
import { loadEnvFiles } from "./env-load";
import {
  generateModelTypes,
  type ModelDefinition,
} from "./model-types";

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

/**
 * Writes TypeScript for every model in the workspace, so a record's `data` is
 * a typed object rather than the `unknown` the JSON scalar hands back.
 */
export async function runTypes(
  options: TypesOptions,
  deps: TypesDeps,
): Promise<number> {
  try {
    loadEnvFiles(deps.cwd, deps.env);
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
      return 0;
    }

    // resolve, not join: an absolute --out is a path, not a suffix.
    const requested = options.out?.trim() || DEFAULT_OUT;
    const outPath = resolvePath(deps.cwd, requested);
    // Inside the app it reads as a repo path; outside it, "../../.." helps
    // nobody - say where the file actually went.
    const inside = relative(deps.cwd, outPath);
    const shown = inside && !inside.startsWith("..") ? inside : outPath;
    const source = generateModelTypes(models, { workspace });

    // Writing an identical file would churn the mtime and, in a watcher, the
    // whole dev server.
    let previous: string | null = null;
    try {
      previous = readFileSync(outPath, "utf8");
    } catch {
      previous = null;
    }
    if (previous === source) {
      deps.log(`cmssy: ${shown} is up to date`);
      return 0;
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
