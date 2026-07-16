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

export const NEEDS_PAGES_EDIT_HINT: DeniedHint = {
  message: "the token's user cannot read this workspace's settings",
  fix: "the token's user needs the PAGES_EDIT permission in the selected workspace",
};

export class CliError extends Error {
  readonly fix?: string;

  constructor(message: string, fix?: string) {
    super(message);
    this.name = "CliError";
    this.fix = fix;
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
    );
  }
  if (!response.ok || envelope?.data === undefined) {
    throw new CliError(`the cmssy API responded with HTTP ${response.status}`);
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
