import type { CmssyClientConfig, CmssyFormDefinition } from "@cmssy/core";
import { buildBlockContext } from "@cmssy/core/internal";
import {
  blocksToSchemas,
  buildLoaderMap,
  type BlockDefinition,
} from "../registry";
import type { CmssyBlockError } from "./block-error";
import { resolveFoldedBlocks } from "./resolve-blocks";

export interface CmssyBlockDataRequestBlock {
  id: string;
  type: string;
  content: Record<string, unknown>;
}

export interface CmssyBlockDataRequestPage {
  id?: string;
  slug: string;
  pageType?: string | null;
}

export interface CmssyBlockDataRequest {
  blocks: CmssyBlockDataRequestBlock[];
  locale: string;
  defaultLocale: string;
  enabledLocales?: string[];
  page?: CmssyBlockDataRequestPage;
}

export interface CmssyBlockDataResult {
  data: Record<string, unknown>;
  errors: Record<string, CmssyBlockError>;
}

export interface ResolveBlockDataRequestOptions {
  blocks: BlockDefinition[];
  config?: CmssyClientConfig;
  forms?: Record<string, CmssyFormDefinition>;
  appContext?: Record<string, unknown>;
  workspaceId?: string;
}

const MAX_BLOCKS = 50;

export function parseBlockDataRequest(body: unknown): CmssyBlockDataRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("cmssy: block data request must be an object");
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.locale !== "string" || !raw.locale) {
    throw new Error("cmssy: block data request needs a locale");
  }
  if (typeof raw.defaultLocale !== "string" || !raw.defaultLocale) {
    throw new Error("cmssy: block data request needs a defaultLocale");
  }
  if (!Array.isArray(raw.blocks)) {
    throw new Error("cmssy: block data request needs a blocks array");
  }
  if (raw.blocks.length > MAX_BLOCKS) {
    throw new Error(
      `cmssy: block data request carries more than ${MAX_BLOCKS} blocks`,
    );
  }
  const blocks = raw.blocks.map((entry) => {
    const block = entry as Record<string, unknown>;
    if (typeof block?.id !== "string" || typeof block?.type !== "string") {
      throw new Error("cmssy: every block needs an id and a type");
    }
    if (typeof block.content !== "object" || block.content === null) {
      throw new Error(`cmssy: block "${block.id}" needs a content object`);
    }
    return {
      id: block.id,
      type: block.type,
      content: { ...(block.content as Record<string, unknown>) },
    };
  });
  const enabled = Array.isArray(raw.enabledLocales)
    ? raw.enabledLocales.filter(
        (locale): locale is string => typeof locale === "string",
      )
    : undefined;
  return {
    blocks,
    locale: raw.locale,
    defaultLocale: raw.defaultLocale,
    ...(enabled?.length ? { enabledLocales: enabled } : {}),
    ...(raw.page ? { page: raw.page as CmssyBlockDataRequestPage } : {}),
  };
}

export async function resolveBlockDataRequest(
  request: CmssyBlockDataRequest,
  options: ResolveBlockDataRequestOptions,
): Promise<CmssyBlockDataResult> {
  const loaderMap = buildLoaderMap(options.blocks);
  const wanted = request.blocks.filter((block) =>
    Object.hasOwn(loaderMap, block.type),
  );
  if (wanted.length === 0) return { data: {}, errors: {} };

  const context = buildBlockContext(
    request.locale,
    request.defaultLocale,
    request.enabledLocales,
    true,
    options.forms,
    { page: request.page, app: options.appContext },
  );

  const resolved = await resolveFoldedBlocks(
    wanted,
    wanted.map((block) => block.content),
    loaderMap,
    request.locale,
    context,
    {
      schemas: blocksToSchemas(options.blocks),
      ...(options.config ? { config: options.config } : {}),
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    },
  );

  const data: Record<string, unknown> = {};
  const errors: Record<string, CmssyBlockError> = {};
  wanted.forEach((block, i) => {
    const entry = resolved[i]!;
    if (entry.error) errors[block.id] = entry.error;
    else data[block.id] = entry.data;
  });
  return { data, errors };
}

export async function handleBlockDataRequest(
  body: unknown,
  options: ResolveBlockDataRequestOptions,
): Promise<Response> {
  let request: CmssyBlockDataRequest;
  try {
    request = parseBlockDataRequest(body);
  } catch (err) {
    return Response.json(
      { message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  const result = await resolveBlockDataRequest(request, options);
  return Response.json(result, {
    headers: { "cache-control": "no-store" },
  });
}
