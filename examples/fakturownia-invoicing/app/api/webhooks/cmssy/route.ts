import { verifyCmssyWebhook, type CmssyWebhookEvent } from "@cmssy/next";

const FAKTUROWNIA_DOMAIN = process.env.FAKTUROWNIA_DOMAIN ?? "";
const FAKTUROWNIA_API_TOKEN = process.env.FAKTUROWNIA_API_TOKEN ?? "";
const CMSSY_WEBHOOK_SECRET = process.env.CMSSY_WEBHOOK_SECRET ?? "";
const CMSSY_API_URL = process.env.CMSSY_API_URL ?? "";
const CMSSY_API_TOKEN = process.env.CMSSY_API_TOKEN ?? "";

interface FakturowniaInvoice {
  id: number;
  number: string;
  view_url: string;
}

async function createFakturowniaInvoice(
  order: CmssyWebhookEvent["data"]["order"],
): Promise<FakturowniaInvoice> {
  const res = await fetch(
    `https://${FAKTUROWNIA_DOMAIN}.fakturownia.pl/invoices.json`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_token: FAKTUROWNIA_API_TOKEN,
        invoice: {
          kind: "vat",
          number: null,
          sell_date: order.createdAt.slice(0, 10),
          issue_date: new Date().toISOString().slice(0, 10),
          payment_to: new Date().toISOString().slice(0, 10),
          status: "paid",
          buyer_name: order.customerEmail,
          buyer_email: order.customerEmail,
          currency: order.currency,
          positions: [
            {
              name: `Order ${order.id}`,
              total_price_gross: order.total / 100,
              quantity: 1,
            },
          ],
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Fakturownia ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as FakturowniaInvoice;
}

async function recordInvoiceOnCmssy(input: {
  workspaceId: string;
  orderId: string;
  number: string;
  url: string;
}): Promise<void> {
  const res = await fetch(`${CMSSY_API_URL}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CMSSY_API_TOKEN}`,
      "x-workspace-id": input.workspaceId,
    },
    body: JSON.stringify({
      query: `mutation($input: RecordOrderInvoiceInput!) {
        recordOrderInvoice(input: $input) { id invoiceNumber }
      }`,
      variables: {
        input: {
          workspaceId: input.workspaceId,
          orderId: input.orderId,
          number: input.number,
          url: input.url,
          provider: "fakturownia",
        },
      },
    }),
  });
  const json = (await res.json()) as { errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`cmssy recordOrderInvoice: ${json.errors[0].message}`);
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();

  let event: CmssyWebhookEvent;
  try {
    event = verifyCmssyWebhook({
      body,
      signatureHeader: req.headers.get("x-cmssy-signature"),
      secret: CMSSY_WEBHOOK_SECRET,
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  if (event.event !== "order.paid") {
    return Response.json({ ignored: event.event });
  }

  const { order, workspaceId } = event.data;

  try {
    const invoice = await createFakturowniaInvoice(order);
    await recordInvoiceOnCmssy({
      workspaceId,
      orderId: order.id,
      number: invoice.number,
      url: invoice.view_url,
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed", {
      status: 500,
    });
  }

  return Response.json({ ok: true });
}
