"use client";

import { useState } from "react";

import { defineBlock, type BlockProps } from "../registry";
import { fields } from "@cmssy/core";
import { useCart } from "./commerce-provider";
import { formatPrice } from "@cmssy/core";
import type { CmssyOrder } from "@cmssy/core";

const checkoutProps = {
  successMessage: fields.text({ label: "Success message" }),
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function CheckoutComponent({
  content: c,
}: BlockProps<typeof checkoutProps>) {
  const { cart, loading, checkout } = useCart();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<CmssyOrder | null>(null);

  if (order) {
    return (
      <div data-cmssy-checkout="done">
        <p>{c.successMessage ?? "Order placed - awaiting payment."}</p>
        <p data-cmssy-order-id>{order.id}</p>
        <p data-cmssy-order-total>{formatPrice(order.total, order.currency)}</p>
      </div>
    );
  }

  if (loading) {
    return <div data-cmssy-checkout="loading">Loading…</div>;
  }
  if (!cart || cart.items.length === 0) {
    return <div data-cmssy-checkout="empty">Your cart is empty.</div>;
  }

  const emailValid = EMAIL_RE.test(email.trim());

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      setOrder(await checkout({ customerEmail: email.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      data-cmssy-checkout={cart.id}
      onSubmit={(e) => {
        e.preventDefault();
        if (emailValid && !busy) void onSubmit();
      }}
    >
      {error ? <p data-cmssy-checkout-error>{error}</p> : null}
      <label>
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          data-cmssy-checkout-email
        />
      </label>
      <p data-cmssy-checkout-total>
        {formatPrice(cart.discountedTotal, cart.currency ?? "USD")}
      </p>
      <button
        type="submit"
        disabled={busy || !emailValid}
        data-cmssy-checkout-submit
      >
        {busy ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}

export const checkoutBlock = defineBlock({
  type: "checkout",
  label: "Checkout",
  category: "Commerce",
  props: checkoutProps,
  component: CheckoutComponent,
});
