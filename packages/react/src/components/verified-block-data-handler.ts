import type { CmssyClientConfig, CmssyFormDefinition } from "@cmssy/core";
import { CMSSY_EDIT_TOKEN_HEADER, verifyCmssyEditToken } from "@cmssy/core";
import type { BlockDefinition } from "../registry";
import { handleBlockDataRequest } from "./block-data-request";

export interface CmssyBlockDataHandlerOptions {
  forms?: Record<string, CmssyFormDefinition>;
  appContext?: Record<string, unknown>;
  workspaceId?: string;
}

function pageOf(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const page = (body as { page?: unknown }).page;
  if (typeof page !== "object" || page === null) return "";
  const slug = (page as { slug?: unknown }).slug;
  return typeof slug === "string" ? slug : "";
}

export function createBlockDataHandler(
  config: CmssyClientConfig & { draftSecret?: string },
  blocks: BlockDefinition[],
  options: CmssyBlockDataHandlerOptions = {},
) {
  return async function handle(request: Request): Promise<Response> {
    if (!config.draftSecret) {
      return new Response(
        "cmssy: the block data route needs config.draftSecret to verify the editor",
        { status: 500 },
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "cmssy: body is not JSON" },
        { status: 400 },
      );
    }
    const authorized = await verifyCmssyEditToken(
      request.headers.get(CMSSY_EDIT_TOKEN_HEADER),
      config.draftSecret,
      { page: pageOf(body) },
    );
    if (!authorized) {
      return new Response(
        "cmssy: block data needs the edit token the editor page was rendered with",
        { status: 403 },
      );
    }
    return handleBlockDataRequest(body, { blocks, config, ...options });
  };
}
