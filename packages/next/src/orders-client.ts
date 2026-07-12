import {
  graphqlRequest,
  resolveApiUrl,
  resolveWorkspaceId,
  type CmssyOrder,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";

const ORDER_FIELDS = `
  id
  status
  subtotal
  discount
  appliedDiscount { code type value amount }
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
  orderNumber
  poNumber
  customerNote
  shippingTotal
  shippingMethod { id label price }
  shippingAddress { name company line1 line2 postalCode city region country phone vatId }
  items { name price listPrice tierMinQty currency quantity sku }
  payments { amount reference provider at }
`;

const PUBLIC_ORDER_FIELDS = `
  id
  orderNumber
  status
  paymentStatus
  fulfillmentStatus
  subtotal
  discount
  appliedDiscount { code type value amount }
  tax
  total
  pricesIncludeTax
  taxSummary { rateId name rate base amount }
  currency
  customerEmail
  poNumber
  customerNote
  shippingTotal
  shippingMethod { id label price }
  shippingAddress { name company line1 line2 postalCode city region country phone vatId }
  amountPaid
  balanceDue
  refundedAmount
  trackingNumber
  trackingCarrier
  invoiceNumber
  invoiceUrl
  paidAt
  fulfilledAt
  createdAt
  items { name price listPrice tierMinQty currency quantity sku taxRate taxAmount }
`;

export const MY_ORDERS = `query MyOrders($workspaceId: ID!, $skip: Int, $limit: Int) {
  account {
    orders(workspaceId: $workspaceId, skip: $skip, limit: $limit) {
      total
      hasMore
      items { ${ORDER_FIELDS} }
    }
  }
}`;

export const MY_ORDER = `query MyOrder($workspaceId: ID!, $id: ID!) {
  account {
    order(workspaceId: $workspaceId, id: $id) { ${ORDER_FIELDS} }
  }
}`;

export const PUBLIC_ORDER_BY_TOKEN = `query PublicOrder($workspaceId: ID!, $orderId: ID!, $accessToken: String!) {
  public {
    order {
      byToken(workspaceId: $workspaceId, orderId: $orderId, accessToken: $accessToken) {
        ${PUBLIC_ORDER_FIELDS}
      }
    }
  }
}`;

const workspaceIdCache = new Map<string, Promise<string>>();

function workspaceIdFor(config: CmssyNextConfig): Promise<string> {
  const key = `${resolveApiUrl(config.apiUrl)}::${config.workspaceSlug}`;
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
  const data = await graphqlRequest<{ account: { orders: MyOrdersResult } }>(
    config,
    MY_ORDERS,
    { workspaceId, skip: options.skip, limit: options.limit },
    { headers: headers(workspaceId, accessToken) },
    "my orders",
  );
  return data.account.orders;
}

export async function backendMyOrder(
  config: CmssyNextConfig,
  accessToken: string,
  id: string,
): Promise<CmssyOrder | null> {
  const workspaceId = await workspaceIdFor(config);
  const data = await graphqlRequest<{ account: { order: CmssyOrder | null } }>(
    config,
    MY_ORDER,
    { workspaceId, id },
    { headers: headers(workspaceId, accessToken) },
    "my order",
  );
  return data.account.order;
}

export async function backendOrderByToken(
  config: CmssyNextConfig,
  options: { orderId: string; accessToken: string },
): Promise<CmssyOrder> {
  const workspaceId = await workspaceIdFor(config);
  const data = await graphqlRequest<{
    public: { order: { byToken: CmssyOrder } };
  }>(
    config,
    PUBLIC_ORDER_BY_TOKEN,
    {
      workspaceId,
      orderId: options.orderId,
      accessToken: options.accessToken,
    },
    { headers: { "x-workspace-id": workspaceId } },
    "public order lookup",
  );
  return data.public.order.byToken;
}
