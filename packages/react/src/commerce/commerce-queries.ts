export interface CmssyPriceTier {
  minQty: number;
  price: number;
}

export interface CmssyCartItemSnapshot {
  name: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  sku: string | null;
  tiers: CmssyPriceTier[];
}

export interface CmssyCartItem {
  id: string;
  recordId: string;
  quantity: number;
  variantSelections: Record<string, string> | null;
  snapshot: CmssyCartItemSnapshot;
  unitPrice: number;
  currentPrice: number | null;
  priceMismatch: boolean;
}

export interface CmssyShippingMethod {
  id: string;
  label: string;
  price: number;
  etaLabel: string | null;
}

export interface CmssyTaxSummaryLine {
  rateId: string | null;
  name: string | null;
  rate: number;
  base: number;
  amount: number;
}

export interface CmssyAddress {
  name: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  region?: string | null;
  country: string;
  phone?: string | null;
  vatId?: string | null;
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
  tax: number;
  taxSummary: CmssyTaxSummaryLine[];
  totalGross: number;
  pricesIncludeTax: boolean;
  shippingMethod: CmssyShippingMethod | null;
  shippingTotal: number;
  availableShippingMethods: CmssyShippingMethod[];
}

export interface CmssyProductVariant {
  id: string;
  sku: string | null;
  price: number;
  inventory: number | null;
  selectedOptions: Array<{ name: string; value: string }>;
  tiers: CmssyPriceTier[];
}

export interface CmssyProduct {
  id: string;
  data: Record<string, unknown>;
  variants: CmssyProductVariant[];
  priceTiers: CmssyPriceTier[];
}

export interface CmssyOrderItem {
  name: string;
  price: number;
  listPrice?: number | null;
  tierMinQty?: number | null;
  currency: string;
  quantity: number;
  sku: string | null;
}

export interface CmssyOrderPayment {
  amount: number;
  reference: string;
  provider: string | null;
  at: string;
}

export type CmssyOrderTaxSummaryLine = CmssyTaxSummaryLine;

export interface CmssyOrder {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  currency: string;
  customerEmail: string;
  tax?: number;
  pricesIncludeTax?: boolean;
  taxSummary?: CmssyOrderTaxSummaryLine[];
  refundedAmount?: number;
  items?: CmssyOrderItem[];
  paymentProvider?: string | null;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  amountPaid?: number;
  balanceDue?: number;
  paymentReference?: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  invoiceProvider?: string | null;
  payments?: CmssyOrderPayment[];
  paidAt?: string | null;
  fulfilledAt?: string | null;
  createdAt?: string;
  orderNumber?: number | null;
  poNumber?: string | null;
  customerNote?: string | null;
  shippingAddress?: CmssyAddress | null;
  shippingMethod?: { id: string; label: string; price: number } | null;
  shippingTotal?: number;
  accessToken?: string | null;
}
