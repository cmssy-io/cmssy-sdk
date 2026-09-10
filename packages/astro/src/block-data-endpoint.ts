import type { CmssyClientConfig } from "@cmssy/core";
import {
  createBlockDataHandler,
  type BlockDefinition,
  type CmssyBlockDataHandlerOptions,
} from "@cmssy/react";

export type CmssyBlockDataEndpointConfig = CmssyBlockDataHandlerOptions;

export function createCmssyBlockDataEndpoint(
  config: CmssyClientConfig & { draftSecret?: string },
  blocks: BlockDefinition[],
  options: CmssyBlockDataEndpointConfig = {},
) {
  const handle = createBlockDataHandler(config, blocks, options);
  return async function POST(context: { request: Request }): Promise<Response> {
    return handle(context.request);
  };
}
