import type { BlockDefinition } from "@cmssy/react";
import {
  createBlockDataHandler,
  type CmssyBlockDataHandlerOptions,
} from "@cmssy/react";
import type { CmssyClientConfig } from "@cmssy/core";

export type CmssyBlockDataRouteConfig = CmssyBlockDataHandlerOptions;

export function createCmssyBlockDataRoute(
  config: CmssyClientConfig & { draftSecret?: string },
  blocks: BlockDefinition[],
  options: CmssyBlockDataRouteConfig = {},
) {
  const handle = createBlockDataHandler(config, blocks, options);
  return async function POST(request: Request): Promise<Response> {
    return handle(request);
  };
}
