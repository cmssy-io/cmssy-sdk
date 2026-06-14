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

export interface CmssyOrderItem {
  name: string;
  price: number;
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

export interface CmssyOrder {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  currency: string;
  customerEmail: string;
  tax?: number;
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
}
