export interface CmssyCartItemSnapshot {
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  sku: string | null;
}

export interface CmssyCartItem {
  id: string;
  recordId: string;
  quantity: number;
  variantSelections: Record<string, string> | null;
  snapshot: CmssyCartItemSnapshot;
  currentPrice: number | null;
  priceMismatch: boolean;
}

export interface CmssyCartDiscount {
  code: string;
  type: string;
  value: number;
  computedAmount: number;
}

export interface CmssyCart {
  id: string;
  status: string;
  items: CmssyCartItem[];
  itemCount: number;
  subtotal: number;
  currency: string | null;
  appliedDiscount: CmssyCartDiscount | null;
  discountedTotal: number;
}

export interface CmssyProductVariant {
  id: string;
  sku: string | null;
  price: number;
  inventory: number | null;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface CmssyProduct {
  id: string;
  data: Record<string, unknown>;
  variants: CmssyProductVariant[];
}

export interface CmssyOrder {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  currency: string;
  customerEmail: string;
}

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

export const CART_QUERY = `query Cart($workspaceId: ID!) {
  cart(workspaceId: $workspaceId) { ${CART_FIELDS} }
}`;

export const ADD_TO_CART_MUTATION = `mutation AddToCart($input: AddToCartInput!) {
  addToCart(input: $input) { ${CART_FIELDS} }
}`;

export const UPDATE_CART_ITEM_MUTATION = `mutation UpdateCartItem($input: UpdateCartItemInput!) {
  updateCartItem(input: $input) { ${CART_FIELDS} }
}`;

export const REMOVE_CART_ITEM_MUTATION = `mutation RemoveCartItem($workspaceId: ID!, $itemId: ID!) {
  removeCartItem(workspaceId: $workspaceId, itemId: $itemId) { ${CART_FIELDS} }
}`;

export const CLEAR_CART_MUTATION = `mutation ClearCart($workspaceId: ID!) {
  clearCart(workspaceId: $workspaceId) { ${CART_FIELDS} }
}`;

export const APPLY_DISCOUNT_MUTATION = `mutation ApplyDiscount($workspaceId: ID!, $code: String!) {
  applyDiscount(workspaceId: $workspaceId, code: $code) { ${CART_FIELDS} }
}`;

export const REMOVE_DISCOUNT_MUTATION = `mutation RemoveDiscount($workspaceId: ID!) {
  removeDiscount(workspaceId: $workspaceId) { ${CART_FIELDS} }
}`;

export const CHECKOUT_MUTATION = `mutation Checkout($input: CheckoutInput!) {
  checkout(input: $input) {
    id
    status
    subtotal
    total
    currency
    customerEmail
  }
}`;

export const PRODUCT_QUERY = `query Product($workspaceId: String!, $modelSlug: String!, $filter: JSON) {
  publicModelRecords(workspaceId: $workspaceId, modelSlug: $modelSlug, filter: $filter, limit: 1) {
    items {
      id
      data
      variants { id sku price inventory selectedOptions { name value } }
    }
  }
}`;
