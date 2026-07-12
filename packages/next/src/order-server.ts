import type { CmssyOrder } from "@cmssy/react";
import type { CmssyNextConfig } from "./config";
import { backendOrderByToken } from "./orders-client";

export interface FetchOrderByTokenOptions {
  orderId: string;
  accessToken: string;
}

export async function fetchOrderByToken(
  config: CmssyNextConfig,
  options: FetchOrderByTokenOptions,
): Promise<CmssyOrder> {
  return backendOrderByToken(config, options);
}
