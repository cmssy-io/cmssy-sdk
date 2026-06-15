import {
  graphqlRequest,
  resolveWorkspaceId,
  type CmssyOrder,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";

const ORDER_FIELDS = `
  id
  status
  subtotal
  tax
  total
  pricesIncludeTax
  taxSummary { rateId name rate base amount }
  currency
  customerEmail
  refundedAmount
  paymentProvider
  paymentStatus
  fulfillmentStatus
  amountPaid
  balanceDue
  paymentReference
  trackingNumber
  trackingCarrier
  invoiceNumber
  invoiceUrl
  invoiceProvider
  paidAt
  fulfilledAt
  createdAt
  items { name price currency quantity sku }
  payments { amount reference provider at }
`;

const MY_ORDERS = `query MyOrders($workspaceId: ID!, $skip: Int, $limit: Int) {
  myOrders(workspaceId: $workspaceId, skip: $skip, limit: $limit) {
    total
    hasMore
    items { ${ORDER_FIELDS} }
  }
}`;

const MY_ORDER = `query MyOrder($workspaceId: ID!, $id: ID!) {
  myOrder(workspaceId: $workspaceId, id: $id) { ${ORDER_FIELDS} }
}`;

const workspaceIdCache = new Map<string, Promise<string>>();

function workspaceIdFor(config: CmssyNextConfig): Promise<string> {
  const key = `${config.apiUrl}::${config.workspaceSlug}`;
  const existing = workspaceIdCache.get(key);
  if (existing) return existing;
  const fresh = resolveWorkspaceId(config).catch((err: unknown) => {
    workspaceIdCache.delete(key);
    throw err;
  });
  workspaceIdCache.set(key, fresh);
  return fresh;
}

export function clearWorkspaceIdCache(): void {
  workspaceIdCache.clear();
}

export interface MyOrdersResult {
  items: CmssyOrder[];
  total: number;
  hasMore: boolean;
}

function headers(workspaceId: string, accessToken: string) {
  return {
    "x-workspace-id": workspaceId,
    authorization: `Bearer ${accessToken}`,
  };
}

export async function backendMyOrders(
  config: CmssyNextConfig,
  accessToken: string,
  options: { skip?: number; limit?: number },
): Promise<MyOrdersResult> {
  const workspaceId = await workspaceIdFor(config);
  const data = await graphqlRequest<{ myOrders: MyOrdersResult }>(
    config,
    MY_ORDERS,
    { workspaceId, skip: options.skip, limit: options.limit },
    { headers: headers(workspaceId, accessToken) },
    "my orders",
  );
  return data.myOrders;
}

export async function backendMyOrder(
  config: CmssyNextConfig,
  accessToken: string,
  id: string,
): Promise<CmssyOrder | null> {
  const workspaceId = await workspaceIdFor(config);
  const data = await graphqlRequest<{ myOrder: CmssyOrder | null }>(
    config,
    MY_ORDER,
    { workspaceId, id },
    { headers: headers(workspaceId, accessToken) },
    "my order",
  );
  return data.myOrder;
}
