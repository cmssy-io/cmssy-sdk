import {
  graphqlRequest,
  resolveApiUrl,
  resolveWorkspaceId,
  type CmssyCart,
  type CmssyOrder,
  type CmssyProduct,
} from "@cmssy/react";
import type { CmssyNextConfig } from "./config";

const CART_FIELDS = `
  id
  status
  itemCount
  subtotal
  currency
  discountedTotal
  appliedDiscount { code type value computedAmount }
  items {
    id
    recordId
    quantity
    variantSelections
    currentPrice
    priceMismatch
    snapshot { name price currency imageUrl sku }
  }
`;

const CART_QUERY = `query Cart($workspaceId: ID!) { cart(workspaceId: $workspaceId) { ${CART_FIELDS} } }`;
const ADD_TO_CART = `mutation AddToCart($input: AddToCartInput!) { addToCart(input: $input) { ${CART_FIELDS} } }`;
const UPDATE_ITEM = `mutation UpdateCartItem($input: UpdateCartItemInput!) { updateCartItem(input: $input) { ${CART_FIELDS} } }`;
const REMOVE_ITEM = `mutation RemoveCartItem($workspaceId: ID!, $itemId: ID!) { removeCartItem(workspaceId: $workspaceId, itemId: $itemId) { ${CART_FIELDS} } }`;
const CLEAR_CART = `mutation ClearCart($workspaceId: ID!) { clearCart(workspaceId: $workspaceId) { ${CART_FIELDS} } }`;
const APPLY_DISCOUNT = `mutation ApplyDiscount($workspaceId: ID!, $code: String!) { applyDiscount(workspaceId: $workspaceId, code: $code) { ${CART_FIELDS} } }`;
const REMOVE_DISCOUNT = `mutation RemoveDiscount($workspaceId: ID!) { removeDiscount(workspaceId: $workspaceId) { ${CART_FIELDS} } }`;
const CHECKOUT = `mutation Checkout($input: CheckoutInput!) {
  checkout(input: $input) { id status subtotal total currency customerEmail }
}`;
const PRODUCT = `query Product($workspaceId: String!, $modelSlug: String!, $filter: JSON) {
  publicModelRecords(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, limit: 1) {
    items { id data variants { id sku price inventory selectedOptions { name value } } }
  }
}`;

export interface CartRequestContext {
  cartToken: string;
  accessToken?: string;
}

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

export function clearCartWorkspaceIdCache(): void {
  workspaceIdCache.clear();
}

async function request<T>(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  workspaceId: string,
  query: string,
  variables: Record<string, unknown>,
  label: string,
): Promise<T> {
  return graphqlRequest<T>(
    config,
    query,
    variables,
    {
      headers: {
        "x-workspace-id": workspaceId,
        "x-cart-session": ctx.cartToken,
        ...(ctx.accessToken
          ? { authorization: `Bearer ${ctx.accessToken}` }
          : {}),
      },
    },
    label,
  );
}

export async function backendGetCart(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
): Promise<CmssyCart | null> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: CmssyCart | null }>(
    config,
    ctx,
    workspaceId,
    CART_QUERY,
    { workspaceId },
    "cart query",
  );
  return data.cart;
}

export async function backendAddToCart(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  input: {
    recordId: string;
    quantity: number;
    variantSelections?: Record<string, string>;
    notes?: string;
  },
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ addToCart: CmssyCart }>(
    config,
    ctx,
    workspaceId,
    ADD_TO_CART,
    { input: { workspaceId, ...input } },
    "add to cart",
  );
  return data.addToCart;
}

export async function backendUpdateItem(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  input: { itemId: string; quantity: number },
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ updateCartItem: CmssyCart }>(
    config,
    ctx,
    workspaceId,
    UPDATE_ITEM,
    { input: { workspaceId, ...input } },
    "update cart item",
  );
  return data.updateCartItem;
}

export async function backendRemoveItem(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  itemId: string,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ removeCartItem: CmssyCart }>(
    config,
    ctx,
    workspaceId,
    REMOVE_ITEM,
    { workspaceId, itemId },
    "remove cart item",
  );
  return data.removeCartItem;
}

export async function backendClearCart(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ clearCart: CmssyCart }>(
    config,
    ctx,
    workspaceId,
    CLEAR_CART,
    { workspaceId },
    "clear cart",
  );
  return data.clearCart;
}

export async function backendApplyDiscount(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  code: string,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ applyDiscount: CmssyCart }>(
    config,
    ctx,
    workspaceId,
    APPLY_DISCOUNT,
    { workspaceId, code },
    "apply discount",
  );
  return data.applyDiscount;
}

export async function backendRemoveDiscount(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ removeDiscount: CmssyCart }>(
    config,
    ctx,
    workspaceId,
    REMOVE_DISCOUNT,
    { workspaceId },
    "remove discount",
  );
  return data.removeDiscount;
}

export async function backendCheckout(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  customerEmail: string,
): Promise<CmssyOrder> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ checkout: CmssyOrder }>(
    config,
    ctx,
    workspaceId,
    CHECKOUT,
    { input: { workspaceId, customerEmail } },
    "checkout",
  );
  return data.checkout;
}

export async function backendProduct(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  modelSlug: string,
  filter: Record<string, unknown>,
): Promise<CmssyProduct | null> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{
    publicModelRecords: { items: CmssyProduct[] };
  }>(
    config,
    ctx,
    workspaceId,
    PRODUCT,
    { workspaceId, modelSlug, filter },
    "product query",
  );
  return data.publicModelRecords.items[0] ?? null;
}
