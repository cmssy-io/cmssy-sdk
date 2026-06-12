"use client";

import { useState } from "react";

import { defineBlock } from "../registry";
import { useCart } from "./commerce-provider";
import { formatPrice } from "./money";

function CartComponent() {
  const {
    cart,
    loading,
    error,
    updateItem,
    removeItem,
    applyDiscount,
    removeDiscount,
  } = useCart();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div data-cmssy-cart="loading">Loading…</div>;
  }
  if (!cart || cart.items.length === 0) {
    return <div data-cmssy-cart="empty">Your cart is empty.</div>;
  }

  const currency = cart.currency ?? "USD";

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      setBusy(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-cmssy-cart={cart.id}>
      {error ? <p data-cmssy-cart-error>{error}</p> : null}
      <ul data-cmssy-cart-items>
        {cart.items.map((item) => (
          <li key={item.id} data-cmssy-cart-item={item.id}>
            <span data-cmssy-item-name>{item.snapshot.name}</span>
            <input
              type="number"
              min="1"
              value={item.quantity}
              disabled={busy}
              onChange={(e) => {
                const qty = Number(e.target.value);
                if (Number.isInteger(qty) && qty >= 1) {
                  void withBusy(() => updateItem(item.id, qty));
                }
              }}
              data-cmssy-item-qty
            />
            <span data-cmssy-item-price>
              {formatPrice(item.snapshot.price * item.quantity, currency)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void withBusy(() => removeItem(item.id))}
              data-cmssy-item-remove
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div data-cmssy-cart-discount>
        {cart.appliedDiscount ? (
          <p>
            <span>{cart.appliedDiscount.code}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void withBusy(() => removeDiscount())}
            >
              Remove
            </button>
          </p>
        ) : (
          <p>
            <input
              type="text"
              value={code}
              placeholder="Discount code"
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={() =>
                void withBusy(async () => {
                  await applyDiscount(code.trim());
                  setCode("");
                })
              }
            >
              Apply
            </button>
          </p>
        )}
      </div>

      <dl data-cmssy-cart-totals>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatPrice(cart.subtotal, currency)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd data-cmssy-cart-total>
            {formatPrice(cart.discountedTotal, currency)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export const cartBlock = defineBlock({
  type: "cart",
  label: "Cart",
  category: "Commerce",
  props: {},
  component: CartComponent,
});
