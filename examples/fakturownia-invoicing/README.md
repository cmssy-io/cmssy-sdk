# Headless invoicing example — Fakturownia

cmssy is the **system of record** for orders but does **not** generate invoices
(legal sequential numbering, PDF, EU e-invoicing/KSeF are jurisdiction-specific
and high-liability — provider territory). Instead, your app reacts to the
`order.paid` webhook, creates the invoice in your provider, and calls back
`recordOrderInvoice` so the number + PDF link show up on the order in cmssy.

This example uses **Fakturownia** (PL), but the shape is identical for
InvoiceXpress, Stripe Invoicing, or any provider — swap `createFakturowniaInvoice`.

## Flow

```
cmssy order.paid ──► your webhook route
                       1. verifyCmssyWebhook(...)            (HMAC, replay-safe)
                       2. createFakturowniaInvoice(order)    (provider API, your keys)
                       3. recordOrderInvoice(number, pdfUrl) (cs_* token → cmssy)
```

`app/api/webhooks/cmssy/route.ts` is a Next.js App Router route handler doing
exactly this.

## Setup

1. **Create a webhook endpoint in cmssy** (Settings → Webhooks) subscribed to
   `order.paid`. Copy its signing secret.
2. **Point it at** `https://your-app.com/api/webhooks/cmssy`.
3. **Env vars** (all in YOUR app's env — cmssy never holds your provider keys):

   ```
   CMSSY_WEBHOOK_SECRET=whsec_...        # the endpoint's signing secret
   CMSSY_API_URL=https://api.cmssy.io    # your cmssy API base
   CMSSY_API_TOKEN=cs_...                # workspace API token (ORDERS_MANAGE)
   FAKTUROWNIA_DOMAIN=your-account        # https://<domain>.fakturownia.pl
   FAKTUROWNIA_API_TOKEN=...             # Fakturownia API token
   ```

## Notes

- **Raw body**: `verifyCmssyWebhook` needs the exact signed bytes — always pass
  `await req.text()`, never a re-serialized object.
- **Idempotency**: `recordOrderInvoice` is idempotent in cmssy — recording the
  same invoice number twice is a no-op, and a _different_ number on an
  already-invoiced order is rejected (409). cmssy also sends a stable
  `X-Cmssy-Webhook-Id` per delivery, so you can dedup retries on your side too.
- **Retries**: cmssy retries failed deliveries with backoff (durable queue), so
  return a non-2xx on transient provider errors and the delivery will be retried.
- **Money**: `order.total` is in integer minor units; divide by 100 (or the
  currency's fraction) for the provider's major-unit amount.
- **Auth**: the `cs_*` token authenticates as the workspace owner; send it as
  `Authorization: Bearer cs_...` plus `x-workspace-id`.
