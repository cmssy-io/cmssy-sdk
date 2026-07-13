import type { CmssyOrder, FetchOrderByTokenOptions } from "@cmssy/types";
import type { CmssyNextConfig } from "./config";
import { backendOrderByToken } from "./orders-client";

// FetchOrderByTokenOptions lives in @cmssy/types; re-exported for consumers.
export type { FetchOrderByTokenOptions };

export async function fetchOrderByToken(
  config: CmssyNextConfig,
  options: FetchOrderByTokenOptions,
): Promise<CmssyOrder> {
  return backendOrderByToken(config, options);
}
