import type { CmssyClientConfig } from "@cmssy/core";
import {
  createBlockDataHandler,
  type BlockDefinition,
  type CmssyBlockDataHandlerOptions,
} from "@cmssy/react";

export type CmssyBlockDataActionConfig = CmssyBlockDataHandlerOptions;

export function createCmssyBlockDataAction(
  config: CmssyClientConfig & { draftSecret?: string },
  blocks: BlockDefinition[],
  options: CmssyBlockDataActionConfig = {},
) {
  const handle = createBlockDataHandler(config, blocks, options);
  return async function action({
    request,
  }: {
    request: Request;
  }): Promise<Response> {
    return handle(request);
  };
}
