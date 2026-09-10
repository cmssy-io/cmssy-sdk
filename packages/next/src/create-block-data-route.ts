import type { BlockDefinition } from "@cmssy/react";
import { handleBlockDataRequest } from "@cmssy/react";
import type { CmssyClientConfig, CmssyFormDefinition } from "@cmssy/core";
import { isCmssyEditMode } from "./edit-mode";

export interface CmssyBlockDataRouteConfig {
  forms?: Record<string, CmssyFormDefinition>;
  appContext?: Record<string, unknown>;
  workspaceId?: string;
}

export function createCmssyBlockDataRoute(
  config: CmssyClientConfig,
  blocks: BlockDefinition[],
  options: CmssyBlockDataRouteConfig = {},
) {
  return async function POST(request: Request): Promise<Response> {
    if (!(await isCmssyEditMode())) {
      return new Response(
        "cmssy: block data is only resolved for a verified editor request",
        { status: 403 },
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { message: "cmssy: body is not JSON" },
        {
          status: 400,
        },
      );
    }
    return handleBlockDataRequest(body, { blocks, config, ...options });
  };
}
