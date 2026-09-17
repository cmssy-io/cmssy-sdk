export const DEFAULT_ADMIN_API_URL = "https://api.cmssy.io/graphql";

export interface DeniedHint {
  message: string;
  fix: string;
}

export interface AdminRequestOptions {
  token: string;
  apiUrl?: string;
  workspaceId?: string;
  fetch?: typeof globalThis.fetch;
  denied?: DeniedHint;
}

export const BAD_TOKEN_HINT: DeniedHint = {
  message: "the cmssy API rejected the token",
  fix: "create an API token in the cmssy dashboard (Settings → API Tokens) and pass it via --token or CMSSY_API_TOKEN",
};

export const NEEDS_MANIFEST_WRITE_HINT: DeniedHint = {
  message: "the token's user cannot write this workspace's block manifest",
  fix: "the token's user needs the PAGES_EDIT permission in the selected workspace",
};

export const NEEDS_PAGES_EDIT_HINT: DeniedHint = {
  message: "the token's user cannot read this workspace's settings",
  fix: "the token's user needs the PAGES_EDIT permission in the selected workspace",
};

export class CliError extends Error {
  readonly fix?: string;
  readonly code?: string;

  constructor(message: string, fix?: string, code?: string) {
    super(message);
    this.name = "CliError";
    this.fix = fix;
    this.code = code;
  }
}

interface AdminGraphqlError {
  message?: string;
  extensions?: { code?: string };
}

function isDenied(errors: AdminGraphqlError[], status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    errors.some(
      (error) =>
        error.extensions?.code === "UNAUTHENTICATED" ||
        error.extensions?.code === "FORBIDDEN" ||
        /unauthenticated|unauthorized|not authorized|not authenticated|invalid token|permission|forbidden|not allowed|access denied/i.test(
          error.message ?? "",
        ),
    )
  );
}

export async function adminGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  options: AdminRequestOptions,
): Promise<T> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const url = options.apiUrl?.trim() || DEFAULT_ADMIN_API_URL;
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.token}`,
        ...(options.workspaceId
          ? { "x-workspace-id": options.workspaceId }
          : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new CliError(
      `cannot reach the cmssy API at ${url}`,
      "check your network connection and CMSSY_API_URL (leave it unset for cmssy cloud)",
    );
  }
  let envelope: { data?: T; errors?: AdminGraphqlError[] } | null = null;
  try {
    envelope = (await response.json()) as {
      data?: T;
      errors?: AdminGraphqlError[];
    };
  } catch {
    envelope = null;
  }
  const errors = Array.isArray(envelope?.errors) ? envelope.errors : [];
  if (isDenied(errors, response.status)) {
    const denied = options.denied ?? BAD_TOKEN_HINT;
    throw new CliError(denied.message, denied.fix);
  }
  if (errors.length > 0) {
    throw new CliError(
      `the cmssy API rejected the request - ${errors
        .map((error) => error.message ?? "GraphQL error")
        .join("; ")}`,
      undefined,
      errors.find((error) => error.extensions?.code)?.extensions?.code,
    );
  }
  if (!response.ok || envelope?.data == null) {
    throw new CliError(
      `the cmssy API returned no data (HTTP ${response.status})`,
      "check that CMSSY_API_URL points at the cmssy admin API (https://api.cmssy.io/graphql), not the delivery endpoint",
    );
  }
  return envelope.data;
}

export const WORKSPACES_MINE_QUERY = `query CliWorkspacesMine {
  workspace {
    mine {
      id
      slug
      name
      organizationSlug
    }
  }
}`;

export const DRAFT_SECRET_QUERY = `query CliDraftSecret {
  workspace {
    draftSecret
  }
}`;

export const UPDATE_PREVIEW_URL_MUTATION = `mutation CliSetPreviewUrl($input: UpdateSiteConfigInput!) {
  siteConfig {
    update(input: $input) {
      previewUrl
    }
  }
}`;

export const SAVE_BLOCK_MANIFEST_MUTATION = `mutation CliSaveBlockManifest($blocks: JSON!, $regions: JSON, $expectedHash: String, $onlyIfAbsent: Boolean, $allowLossy: Boolean) {
  blockManifest {
    save(blocks: $blocks, regions: $regions, expectedHash: $expectedHash, onlyIfAbsent: $onlyIfAbsent, allowLossy: $allowLossy) {
      hash
      updatedAt
    }
  }
}`;

export interface CliWorkspace {
  id: string;
  slug: string;
  name: string;
  organizationSlug: string | null;
}

export async function fetchMyWorkspaces(
  options: AdminRequestOptions,
): Promise<CliWorkspace[]> {
  const data = await adminGraphql<{
    workspace: { mine: CliWorkspace[] };
  }>(WORKSPACES_MINE_QUERY, {}, options);
  return data.workspace.mine;
}

export async function fetchDraftSecret(
  options: AdminRequestOptions,
): Promise<string> {
  const data = await adminGraphql<{ workspace: { draftSecret: string } }>(
    DRAFT_SECRET_QUERY,
    {},
    { ...options, denied: NEEDS_PAGES_EDIT_HINT },
  );
  return data.workspace.draftSecret;
}

export async function setPreviewUrl(
  previewUrl: string,
  options: AdminRequestOptions,
): Promise<void> {
  await adminGraphql<{ siteConfig: { update: { previewUrl: string | null } } }>(
    UPDATE_PREVIEW_URL_MUTATION,
    { input: { previewUrl } },
    { ...options, denied: NEEDS_PAGES_EDIT_HINT },
  );
}

export const BLOCK_MANIFEST_HASH_QUERY = `query CliBlockManifestHash {
  blockManifest {
    get {
      hash
    }
  }
}`;

export async function fetchBlockManifestHash(
  options: AdminRequestOptions,
): Promise<string | null> {
  const data = await adminGraphql<{
    blockManifest: { get: { hash: string } | null };
  }>(
    BLOCK_MANIFEST_HASH_QUERY,
    {},
    {
      ...options,
      denied: NEEDS_MANIFEST_WRITE_HINT,
    },
  );
  return data.blockManifest.get?.hash ?? null;
}

export interface SavedBlockManifest {
  hash: string;
  updatedAt: string;
}

export interface SaveBlockManifestGuard {
  expectedHash?: string;
  onlyIfAbsent?: boolean;
  allowLossy?: boolean;
}

export async function saveBlockManifest(
  manifest: { blocks: unknown[]; regions: unknown[] | null },
  options: AdminRequestOptions,
  guard: SaveBlockManifestGuard = {},
): Promise<SavedBlockManifest> {
  const data = await adminGraphql<{
    blockManifest: { save: SavedBlockManifest };
  }>(
    SAVE_BLOCK_MANIFEST_MUTATION,
    { ...manifest, ...guard },
    {
      ...options,
      denied: NEEDS_MANIFEST_WRITE_HINT,
    },
  );
  return data.blockManifest.save;
}

export const BLOCK_MANIFEST_IMPACT_QUERY = `query CliBlockManifestImpact($blocks: JSON!, $regions: JSON) {
  blockManifest {
    impact(blocks: $blocks, regions: $regions) {
      hash
      activeHash
      unchanged
      addedTypes
      removedTypes { type pages publishedPages }
      changedTypes
      removedFields { type fields }
      removedRegions
      changedRegions
      moves
      lossyMoves
      documents
      heldDocuments
    }
  }
}`;

export interface BlockManifestImpact {
  hash: string;
  activeHash: string | null;
  unchanged: boolean;
  addedTypes: string[];
  removedTypes: { type: string; pages: number; publishedPages: number }[];
  changedTypes: string[];
  removedFields: { type: string; fields: string[] }[];
  removedRegions: string[];
  changedRegions: string[];
  moves: number;
  lossyMoves: number;
  documents: number;
  heldDocuments: number;
}

export async function fetchBlockManifestImpact(
  manifest: { blocks: unknown[]; regions: unknown[] | null },
  options: AdminRequestOptions,
): Promise<BlockManifestImpact> {
  const data = await adminGraphql<{
    blockManifest: { impact: BlockManifestImpact };
  }>(BLOCK_MANIFEST_IMPACT_QUERY, manifest, {
    ...options,
    denied: NEEDS_MANIFEST_WRITE_HINT,
  });
  return data.blockManifest.impact;
}
