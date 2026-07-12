import {
  graphqlRequest,
  resolveApiUrl,
  resolveWorkspaceId,
  type CmssyAddress,
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
  tax
  totalGross
  pricesIncludeTax
  shippingTotal
  taxSummary { rateId name rate base amount }
  shippingMethod { id label price etaLabel }
  availableShippingMethods { id label price etaLabel }
  appliedDiscount { code type value computedAmount }
  items {
    id
    recordId
    quantity
    variantSelections
    unitPrice
    currentPrice
    priceMismatch
    snapshot { name price currency imageUrl sku tiers { minQty price } }
  }
`;

export const CART_QUERY = `query Cart($workspaceId: ID!) { cart { get(workspaceId: $workspaceId) { ${CART_FIELDS} } } }`;
export const ADD_TO_CART = `mutation AddToCart($input: AddToCartInput!) { cart { addItem(input: $input) { ${CART_FIELDS} } } }`;
export const UPDATE_ITEM = `mutation UpdateCartItem($input: UpdateCartItemInput!) { cart { updateItem(input: $input) { ${CART_FIELDS} } } }`;
export const REMOVE_ITEM = `mutation RemoveCartItem($workspaceId: ID!, $itemId: ID!) { cart { removeItem(workspaceId: $workspaceId, itemId: $itemId) { ${CART_FIELDS} } } }`;
export const CLEAR_CART = `mutation ClearCart($workspaceId: ID!) { cart { clear(workspaceId: $workspaceId) { ${CART_FIELDS} } } }`;
export const APPLY_DISCOUNT = `mutation ApplyDiscount($workspaceId: ID!, $code: String!) { cart { applyDiscount(workspaceId: $workspaceId, code: $code) { ${CART_FIELDS} } } }`;
export const REMOVE_DISCOUNT = `mutation RemoveDiscount($workspaceId: ID!) { cart { removeDiscount(workspaceId: $workspaceId) { ${CART_FIELDS} } } }`;
export const SET_SHIPPING_METHOD = `mutation SetShippingMethod($workspaceId: ID!, $shippingMethodId: String) {
  cart { setShippingMethod(workspaceId: $workspaceId, shippingMethodId: $shippingMethodId) { ${CART_FIELDS} } }
}`;
export const MERGE_CART = `mutation MergeCart($workspaceId: ID!) { cart { merge(workspaceId: $workspaceId) { ${CART_FIELDS} } } }`;
export const CHECKOUT = `mutation Checkout($input: CheckoutInput!) {
  cart {
    checkout(input: $input) {
      id
      orderNumber
      status
      subtotal
      tax
      total
      currency
      customerEmail
      accessToken
      poNumber
      customerNote
      shippingTotal
      pricesIncludeTax
      shippingMethod { id label price }
      shippingAddress { name company line1 line2 postalCode city region country phone vatId }
      taxSummary { rateId name rate base amount }
      items { name sku quantity price listPrice tierMinQty currency taxRate taxAmount }
    }
  }
}`;
export const PRODUCT = `query Product($workspaceId: String!, $modelSlug: String!, $filter: JSON) {
  public {
    model {
      records(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, limit: 1) {
        items {
          id
          data
          priceTiers { minQty price }
          variants { id sku price inventory tiers { minQty price } selectedOptions { name value } }
        }
      }
    }
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
  const data = await request<{ cart: { get: CmssyCart | null } }>(
    config,
    ctx,
    workspaceId,
    CART_QUERY,
    { workspaceId },
    "cart query",
  );
  return data.cart.get;
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
  const data = await request<{ cart: { addItem: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    ADD_TO_CART,
    { input: { workspaceId, ...input } },
    "add to cart",
  );
  return data.cart.addItem;
}

export async function backendUpdateItem(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  input: { itemId: string; quantity: number },
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { updateItem: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    UPDATE_ITEM,
    { input: { workspaceId, ...input } },
    "update cart item",
  );
  return data.cart.updateItem;
}

export async function backendRemoveItem(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  itemId: string,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { removeItem: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    REMOVE_ITEM,
    { workspaceId, itemId },
    "remove cart item",
  );
  return data.cart.removeItem;
}

export async function backendClearCart(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { clear: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    CLEAR_CART,
    { workspaceId },
    "clear cart",
  );
  return data.cart.clear;
}

export async function backendApplyDiscount(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  code: string,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { applyDiscount: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    APPLY_DISCOUNT,
    { workspaceId, code },
    "apply discount",
  );
  return data.cart.applyDiscount;
}

export async function backendRemoveDiscount(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { removeDiscount: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    REMOVE_DISCOUNT,
    { workspaceId },
    "remove discount",
  );
  return data.cart.removeDiscount;
}

export async function backendSetShippingMethod(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  shippingMethodId: string | null,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { setShippingMethod: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    SET_SHIPPING_METHOD,
    { workspaceId, shippingMethodId },
    "set shipping method",
  );
  return data.cart.setShippingMethod;
}

export async function backendMergeCart(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
): Promise<CmssyCart> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { merge: CmssyCart } }>(
    config,
    ctx,
    workspaceId,
    MERGE_CART,
    { workspaceId },
    "merge cart",
  );
  return data.cart.merge;
}

export interface CheckoutInput {
  customerEmail: string;
  poNumber?: string | null;
  customerNote?: string | null;
  shippingAddress?: CmssyAddress | null;
}

export async function backendCheckout(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  input: CheckoutInput,
): Promise<CmssyOrder> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{ cart: { checkout: CmssyOrder } }>(
    config,
    ctx,
    workspaceId,
    CHECKOUT,
    { input: { workspaceId, ...input } },
    "checkout",
  );
  return data.cart.checkout;
}

export async function backendProduct(
  config: CmssyNextConfig,
  ctx: CartRequestContext,
  modelSlug: string,
  filter: Record<string, unknown>,
): Promise<CmssyProduct | null> {
  const workspaceId = await workspaceIdFor(config);
  const data = await request<{
    public: { model: { records: { items: CmssyProduct[] } } };
  }>(
    config,
    ctx,
    workspaceId,
    PRODUCT,
    { workspaceId, modelSlug, filter },
    "product query",
  );
  return data.public.model.records.items[0] ?? null;
}
