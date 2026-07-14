import type { CmssyOrder, FetchOrderByTokenOptions } from "@cmssy/types";
import type { CmssyConfig } from "../config";
import { backendOrderByToken } from "../orders-client";

// FetchOrderByTokenOptions lives in @cmssy/types; re-exported for consumers.
export type { FetchOrderByTokenOptions };

export async function fetchOrderByToken(
  config: CmssyConfig,
  options: FetchOrderByTokenOptions,
): Promise<CmssyOrder> {
  return backendOrderByToken(config, options);
}
