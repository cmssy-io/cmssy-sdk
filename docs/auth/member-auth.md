---
title: Member auth
description: Authenticate site members against the delivery API - the mutations, the session shape, and the rules that keep tokens out of the browser. App-owned since SDK 10.0.
---

# Member auth

**The SDK no longer ships auth.** 10.0 removed `createCmssyAuthRoute`,
`createCmssyAuthMiddleware`, `getCmssyUser`, the session helpers, the
`CmssyAuthProvider` / `useCmssyUser` pair and `config.auth`. Sign-in is four
GraphQL mutations and a cookie - both of which your app already knows how to do,
and neither of which the SDK can do better without owning your session model.

What cmssy still provides: the member model, the mutations below, and access
tokens scoped to a workspace. What you provide: the session cookie and the
request wiring.

A complete implementation is in
[next-storefront](https://github.com/cmssy-io/examples/tree/main/next-storefront) -
[`services/auth.ts`](https://github.com/cmssy-io/examples/blob/main/next-storefront/services/auth.ts),
[`lib/cmssy/session-crypto.ts`](https://github.com/cmssy-io/examples/blob/main/next-storefront/lib/cmssy/session-crypto.ts),
[`lib/actions/auth.ts`](https://github.com/cmssy-io/examples/blob/main/next-storefront/lib/actions/auth.ts).

## The mutations

All of them live under `siteMember` and take the member `modelSlug` from your
workspace:

| Mutation              | Input                                       | Returns                                               |
| --------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `siteMember.login`    | `{ modelSlug, identity, password }`         | `accessToken`, `refreshToken`, `accessTokenExpiresIn` |
| `siteMember.register` | `{ modelSlug, identity, password, fields }` | `success`, `message`                                  |
| `siteMember.refresh`  | `refreshToken`                              | a rotated token pair                                  |
| `siteMember.logout`   | `refreshToken`                              | `success`, `message`                                  |

`fields` on `register` takes only fields the account model opens to members
("Member can change", `memberCanSet`). Any other non-null key refuses the
sign-up and `message` names it: `Not available at registration: vatId`. The
login comes from `identity`, the password from `password`; the company field
is never accepted - the workspace assigns it.

```ts
// services/auth.ts
export function signIn(identity: string, password: string) {
  return authRequest(
    SiteMemberLoginDocument,
    { input: { modelSlug: MEMBER_MODEL_SLUG, identity, password } },
    "site member login",
  ).then((data) => data.siteMember.login);
}
```

Authenticated reads carry the access token yourself:

```ts
graphqlRequest(cmssy, MY_ORDERS_QUERY, variables, {
  headers: {
    "x-workspace-id": workspaceId,
    authorization: `Bearer ${accessToken}`,
  },
});
```

## Mail to members is yours to send

cmssy never emails your members. Every flow that needs a link in a mailbox
issues a single-use token and hands it to your app as a signed webhook event;
your app builds the link and sends the mail with whatever provider it uses.

| Event                              | Raised by                                                                                            | Your link calls                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- |
| `account.verification_requested`   | `register` when the model requires verification, the admin's resend                                  | `siteMember.verifyEmail`        |
| `account.password_reset_requested` | `forgotPassword` for an active account, the admin's reset, `register` on an account with no password | `siteMember.resetPassword`      |
| `account.login_change_requested`   | `requestLoginChange`                                                                                 | `siteMember.confirmLoginChange` |

`event.data` is `CmssyWebhookAccountRequest` from `@cmssy/core`:
`{ workspaceId, modelSlug, recordId, login, previousLogin?, token, expiresAt }`.
`login` is where the mail goes - for a login change, the new login.

- **Subscribe an endpoint** to the three events (Settings -> Webhooks). It needs
  the `customers:manage` permission, the same one that resets a member's
  password from the admin. Without a subscriber the token is issued and nothing
  reaches the member; the admin's reset and resend say so.
- **Account events are never replayed.** The token is single-use and leaves the
  stored delivery once it is delivered or has failed for good. A member who
  missed a mail asks again.
- **A login that is not an email** is yours to reach: cmssy sends the same event
  with a username in `login`, and your app decides how to prove it.

```ts
const event = await verifyCmssyWebhook({ body, signatureHeader, secret });
if (event.event.startsWith("account.")) {
  const { data } = event as unknown as CmssyWebhookAccountEvent;
  await sendMail(data.login, linkFor(event.event, data.token));
}
```

## The member's own account

A signed-in member reads and changes their own record with the same access
token. No operation takes a record id - each one acts on the session's member,
in the workspace of the route.

| Operation                                                  | Returns                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `account.profile(workspaceId)`                             | `id`, `login`, `pendingLogin`, `data`, `editableFields`, `loginField`, `passwordField`, `priceList` |
| `siteMember.updateProfile(fields)`                         | the updated profile                                                                    |
| `siteMember.changePassword(currentPassword, newPassword)`  | a fresh token pair - every older session ends                                          |
| `siteMember.requestLoginChange(newLogin, currentPassword)` | `success`, `message` - raises `account.login_change_requested`                         |
| `siteMember.confirmLoginChange(token)`                     | `success`, `message` - needs no session                                                |
| `siteMember.deleteAccount(currentPassword)`                | `success`, `message` - the record is removed                                           |

- **Which fields a member may change** is set per field on the account model:
  "Member can change" (`memberCanSet`) in the field editor. Nothing is open by
  default. The same flag opens the field at sign-up (`register`'s `fields`).
  `editableFields` on the profile lists the open fields; render inputs for them.
- **The login and the password have their own flows.** Opening the login field
  allows `requestLoginChange`, opening the password field allows
  `changePassword`; `updateProfile` refuses both keys. The profile names them:
  `loginField` and `passwordField` are the keys to route to those flows.
- **Write the new tokens after `changePassword`.** The call ends every session,
  including the one that made it. The pair it returns is the only way to stay
  signed in.
- **A login change takes two steps.** Confirm on a button press, not on page
  load - mail scanners open links. A password change, a reset or "log out
  everywhere" voids a pending change.
- **After `deleteAccount`, clear your session cookie.** Orders the member placed
  stay with the shop.

A working account page, the three link pages and the webhook route are in
next-storefront:
[`services/account.ts`](https://github.com/cmssy-io/examples/blob/main/next-storefront/services/account.ts),
[`lib/actions/account.ts`](https://github.com/cmssy-io/examples/blob/main/next-storefront/lib/actions/account.ts),
[`app/api/cmssy/webhook/route.ts`](https://github.com/cmssy-io/examples/blob/main/next-storefront/app/api/cmssy/webhook/route.ts).

## Buyer prices

A member can buy from a price list - their company's, or their own. The
catalogue a visitor sees stays the anonymous one; the member's prices are a
second, per-member read on top of it.

1. **Keep catalogue pages anonymous and cacheable.** Render the product grid
   and the product page with the catalogue price, exactly as for a signed-out
   visitor. Never key a cached page on the member.
2. **After sign-in, ask once for the products on screen.** `getBuyerPrices`
   from `@cmssy/core` takes up to 100 items (`CMSSY_BUYER_PRICES_MAX_ITEMS`)
   and the member's access token, server-side:

```ts
import { getBuyerPrices } from "@cmssy/core";

const prices = await getBuyerPrices(
  cmssy,
  products.map((product) => ({ recordId: product.id })),
  { workspaceId, accessToken },
);
```

3. **Never cache that response for anyone else.** It is the member's price -
   no shared fetch cache, no CDN, no `unstable_cache` keyed without the member.
   Read it from a Server Action or a dynamic route segment and patch the prices
   into the page you already rendered.

Each row is a `CmssyBuyerPrice`: `recordId`, `variantKey`, `currency`,
`price`, `priceMax`, `listed`, the quantity rule (`minQuantity`,
`maxQuantity`, `increment` - order in multiples of `increment`, `1` when any
quantity goes) and the volume `tiers` this member gets. Amounts
are in minor units. `displayMode` says how this buyer reads prices - `net` for
a company buyer, `gross` for a consumer, unless the company overrides it - and
`priceAmount`, `priceMaxAmount` and `basePriceAmount` split `price`,
`priceMax` and `basePrice` into `{ net, tax, gross }` at `taxRate`. Show the
side `displayMode` names rather than recomputing VAT in the storefront. Pass `variantKey` (the delivery `ProductVariant.id`) for
one variant; leave it out on a variant product to get a range - `price` is the
lowest, `priceMax` the highest, and `tiers` is empty. `listed` is true when a
price list set the price, for a "your price" badge. A product the member
cannot see, or that does not exist, is left out - match rows by `recordId`
and `variantKey`, not by position.

The operation is vendored as `BuyerPrices` by `cmssy types`; the raw document
is `BUYER_PRICES_QUERY`:

```graphql
query BuyerPrices($workspaceId: ID!, $items: [PriceQueryItem!]!) {
  account {
    prices(workspaceId: $workspaceId, items: $items) {
      recordId
      variantKey
      currency
      price
      priceMax
      listed
      minQuantity
      maxQuantity
      increment
      tiers {
        minQty
        price
      }
      displayMode
      taxRate
      priceAmount {
        net
        tax
        gross
      }
    }
  }
}
```

The profile names the list, for a label like "Gold dealer" -
`account.profile.priceList { name }`, `null` when none applies:

```graphql
query MyPriceList($workspaceId: ID!) {
  account {
    profile(workspaceId: $workspaceId) {
      priceList {
        name
      }
    }
  }
}
```

### The cart is priced for the buyer

A line in the cart already carries the member's price: `unitPrice` is what is
charged. `snapshot.basePrice` is the catalogue price before the price list and
volume breaks, for a struck-through "was" price - show it only when it is
above `unitPrice`, since a list with a markup prices above the catalogue; it is
`null` on a line added before price lists existed.

```graphql
query CartBasePrices($workspaceId: ID!) {
  cart {
    get(workspaceId: $workspaceId) {
      items {
        id
        unitPrice
        snapshot {
          basePrice
          currency
        }
      }
    }
  }
}
```

The cart, its lines, shipping methods and orders carry the same net/gross
split for the buyer: `Cart.displayMode` and `taxRoundingMethod`,
`Cart.amounts { subtotal discount shipping total }` (each
`{ net tax gross }`), `CartItem.unit`, `line` and `taxRate`,
`ShippingMethod.amount`, and on `PublicOrder` / `PublicOrderItem` the
`amounts`, `displayMode`, `taxRoundingMethod`, `unit` and `line` frozen at
checkout. VAT for a company buyer is rounded per line or per rate as the
workspace (or the company) chose; a consumer is always per line.

```graphql
query CartAmounts($workspaceId: ID!) {
  cart {
    get(workspaceId: $workspaceId) {
      displayMode
      amounts {
        subtotal { net tax gross }
        shipping { net tax gross }
        total { net tax gross }
      }
      items {
        id
        line { net tax gross }
      }
    }
  }
}
```

### Checkout can refuse a repriced cart

Signing in, signing out, a change to the member's price list, or the merchant
changing a catalogue or price-list price can move the cart's prices after the
buyer saw them - every cart read re-prices its lines to the live price. Checkout
then refuses rather than charging a total nobody showed. Send the total you
displayed as `expectedTotal` (minor units, the cart's `totalGross`) in
`CheckoutInput`: checkout refuses with `CART_REPRICED` whenever it computes a
different total, even when another read re-priced the cart first. `checkoutErrorReason(error)` from `@cmssy/core`
names the case; `CmssyGraphqlError.reason` carries the raw value.

| Reason                  | What happened                                                         | What to do                                                       |
| ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `CART_REPRICED`         | The buyer's prices changed since the cart was read, or the total differs from `expectedTotal` | Read the cart again, show the new total, let the buyer check out |
| `CART_CURRENCY_CHANGED` | A line is now priced in another currency than the cart (its price list or the product changed) | Remove that line (`extensions.itemId`) and add the product again |
| `BUYER_CHANGED`         | The cart was restamped for another buyer (company switch, guest cart bound at sign-in) | Read the cart again, show the new total, let the buyer check out |
| `PRODUCT_NOT_SOLD`      | A line's product is no longer sold                                    | Remove that line (`extensions.itemId`)                           |
| `TAX_TREATMENT_CHANGED` | The checkout address taxes the order unlike the cart (reverse charge, see below) | Set the address on the cart (`cart.setShippingAddress`), read the cart again, then check out |
| `NO_PRICE_IN_CURRENCY`  | The product has no price in the channel's currency (see [Currency comes from the channel](#currency-comes-from-the-channel)); also raised by `addItem` | Do not offer the product on this channel                         |
| `QUANTITY_BELOW_MIN`    | A line is below the buyer's minimum                                   | Set the line to an allowed quantity                              |
| `QUANTITY_ABOVE_MAX`    | A line is above the buyer's maximum                                   | Set the line to an allowed quantity                              |
| `QUANTITY_NOT_ON_STEP`  | A line is not a multiple of the product's order step                  | Set the line to an allowed quantity                              |

Adding or updating a line raises the three quantity reasons too, before the
cart changes - `LIMIT_EXCEEDED` above the maximum, `BAD_USER_INPUT` below the
minimum or off the step. `quantityRuleViolation(error)` reads the rule the
quantity broke: `{ reason, quantity, minQuantity, maxQuantity, increment,
itemId }`, `itemId` set only when checkout names the line.

```ts
import { checkoutErrorReason, quantityRuleViolation } from "@cmssy/core";

try {
  await checkout(input);
} catch (error) {
  const reason = checkoutErrorReason(error);
  if (reason === "CART_REPRICED") return { refreshCart: true };
  if (reason === "CART_CURRENCY_CHANGED") return { removeStaleLine: true };
  const rule = quantityRuleViolation(error);
  if (rule) return { fixQuantity: rule };
  throw error;
}
```

### Reverse charge and VAT exemptions

A company buyer can be taxed other than `standard`. The workspace sets its
seller country; the merchant sets a company's EU VAT id and marks it verified,
or records a VAT exemption with its legal basis. cmssy then picks one treatment
per cart, price read and order - `TaxTreatmentKind`, one of
`taxTreatmentKindValues`:

| Kind             | When                                                                                 | Tax         |
| ---------------- | ------------------------------------------------------------------------------------ | ----------- |
| `standard`       | Everyone else: consumers, guests, domestic B2B, unverified VAT ids, goods shipped home or outside the EU | As before   |
| `exempt`         | The company has a recorded exemption                                                 | 0           |
| `reverse_charge` | The workspace sells from the EU and the company has a verified EU VAT id of another member state; shipped to another EU state, or no address | 0           |
| `export`         | The workspace sells from outside the EU (Norway, Switzerland, UK...) and the order ships to another country - any buyer, guests included | 0           |

A `reverse_charge`, `exempt` or `export` order in a workspace that stores gross prices
pays net: the VAT inside the stored price is taken out, not charged. Price rows
carry `taxTreatmentKind`; `Cart.taxTreatment`, `BuyerPricePage.taxTreatment`
and `PublicOrder.taxTreatment` carry the decision and the facts it rests on
(`CmssyTaxTreatment`); on an order they are frozen at checkout. Tax summary
lines name their `treatment`. `legalNote` is the text to print on the invoice,
`null` for `standard`.

`export` is decided from the shipping address, so a cart or price read without
one shows `standard`. Set the address on the cart (`setShippingAddress`) before
checkout: a foreign address sent only to `checkout` changes the treatment the
buyer saw and is refused with `TAX_TREATMENT_CHANGED`.

```graphql
query CartTaxTreatment($workspaceId: ID!) {
  cart {
    get(workspaceId: $workspaceId) {
      taxTreatment {
        kind
        legalNote
        buyerVatId
        buyerVatCountry
        sellerCountry
        shipToCountry
      }
      taxSummary {
        rate
        base
        amount
        treatment
      }
    }
  }
}
```

The ship-to country can flip the decision, so send the address to the cart
(`cart.setShippingAddress`) before checkout. Checkout with an address that
taxes the order differently from what the cart showed refuses with
`TAX_TREATMENT_CHANGED`.

**cmssy records the decision; the merchant owns the tax.** cmssy decides the
treatment from the data the merchant entered and stores it with the order.
The invoice wording (`legalNote`, editable per workspace), checking the VAT id
(for example in VIES), the VAT returns and EC Sales List, and the evidence that
goods left the country are the merchant's responsibility.

## Sales channels

A workspace can sell one catalogue to several audiences - a HoReCa storefront
and a retail one, say - through **sales channels**. A price list published to a
channel prices that channel's visitors. Name the channel your storefront sells
through once, in the config:

```ts
export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
  channel: "horeca",
});
```

`channel` on the config (`CmssyClientConfig` or `CmssyConfig`) fills
`$channel` on every operation that declares it and does not pass one -
`queryScoped`, `query` and `graphqlRequest` alike, and `getBuyerPrices` /
`getBuyerCatalogPrices`. Pass `channel` yourself to pick another channel for
one call, or `null` for the cart without a channel. Without a `channel` in the
config nothing changes: an operation that does not send one behaves exactly as
before channels existed.

**The cart is per channel.** Every cart field takes an optional `channel` -
`get`, `addItem` and `updateItem` (in the input), `removeItem`, `clear`,
`applyDiscount`, `removeDiscount`, `setShippingAddress`, `setShippingMethod`,
`merge` and `checkout` (in the input). A buyer has one active cart per channel,
and the channel is frozen when the cart is created: switching channel switches
cart, it never reprices one. `Cart.channel` is the key the cart was started on,
`null` for a cart without one. Declare `$channel` and the config fills it:

```graphql
query ChannelCart($workspaceId: ID!, $channel: String) {
  cart {
    get(workspaceId: $workspaceId, channel: $channel) {
      id
      channel
      totalGross
    }
  }
}
```

`merge` at sign-in folds every guest cart of the session into the member's cart
on the same channel; its `channel` only picks which cart the response returns.

**Signed-in prices take the channel too.** With a channel, `account.prices` and
`account.catalogPrices` price each product from the member's own list, then the
channel's dated list, then its base list, then the catalogue.
`CmssyBuyerPrice.listSource` names whose list priced the row - `MEMBER`,
`COMPANY` or `CHANNEL` (`priceListSourceValues`), `null` for the catalogue.

### Anonymous channel prices

A visitor who is not signed in reads the channel's prices from
`public.pricing` - no member token, no session, so the response is the same for
every visitor on that channel and safe to cache:

```ts
import { getPublicPrices } from "@cmssy/core";

const { items, displayMode, priceWithheld, nextChangeAt } =
  await getPublicPrices(
    cmssy,
    products.map((product) => ({ recordId: product.id })),
    { workspaceId },
  );
```

`getPublicPrices(config, items, { workspaceId, channel?, locale? })` takes up to
`CMSSY_PUBLIC_PRICES_MAX_ITEMS` (50) items; `getPublicCatalogPrices(config,
query, { workspaceId, channel? })` lists, filters and sorts a model by the
channel's price, with the same arguments as `getBuyerCatalogPrices`. Both read
the channel from the options, else from the config, and throw before the network
when neither has one. Each item is `{ record, price }`; an unknown or hidden
product is left out.

- **`priceWithheld`** is set when the channel shows prices only to signed-in
  customers (`MEMBERS_ONLY`) or to buyers of an approved company
  (`COMPANY_MEMBERS_ONLY`) - one of `priceWithheldReasonValues`. Every `price`
  is then `null` and the catalogue page is empty: list the products through
  `public.model.records` and show "log in for prices".
- **`nextChangeAt`** is when the channel's prices next change - the next start
  or end of a dated list. Use it as the revalidation deadline of a cached page
  and as JSON-LD `Offer.priceValidUntil`.
- **`displayMode`** is the channel's net or gross default; the price amounts are
  already split into `{ net, tax, gross }`.

The raw documents are `PUBLIC_PRICES_QUERY` and `PUBLIC_CATALOG_PRICES_QUERY`.

### Channel refusals

`channelRefusal(error)` reads why the API refused a channel:
`{ reason, channel }` with `reason` one of `channelRefusalReasonValues`.

| `reason`               | When                                                                                 | What the storefront does                       |
| ---------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `UNKNOWN_CHANNEL`      | The key is not a channel of the workspace, or not a valid key (`BAD_USER_INPUT`)     | Fix the config - the channel was deleted or misspelt |
| `MEMBERS_ONLY`         | The channel sells to signed-in customers only (`UNAUTHORIZED`)                       | Send the visitor to sign in                    |
| `COMPANY_MEMBERS_ONLY` | The channel sells to buyers of an approved company only (`UNAUTHORIZED` or `FORBIDDEN`) | Explain the account needs an approved company |

The price-access refusals come from cart writes, merge, checkout and
`account.prices` / `account.catalogPrices`; `public.pricing` withholds instead
of refusing.

```ts
import { channelRefusal } from "@cmssy/core";

try {
  await addToCart(input);
} catch (error) {
  const refusal = channelRefusal(error);
  if (refusal?.reason === "MEMBERS_ONLY") return { signIn: true };
  throw error;
}
```

### Currency comes from the channel

A workspace keeps one **default currency** and may enable **additional
currencies**; each sales channel sells in one of them. The buyer never picks a
currency - the storefront picks the channel, and the channel's currency prices
everything. Nothing is converted: the merchant sets an explicit price in every
currency a product is sold in (product, variant, volume breaks, price-list
rows, shipping methods, discount minimums). The site config's `publicCart` lists
`defaultCurrency` and `additionalCurrencies`.

**A product with no price in the channel's currency is not sold there.**
`getPublicPrices` returns its row with `price: null`, `getPublicCatalogPrices`
and `getBuyerCatalogPrices` leave it out of the page, and `addItem` refuses it
with `NO_PRICE_IN_CURRENCY` (`extensions.currency`, `recordId`, `variantKey`) -
one of `checkoutErrorReasonValues`, from `@cmssy/types`
`cartCurrencyReasonValues`.

**Format with the currency the API returns, never a hard-coded one.** Every
price row carries `currency`; `CmssyPublicPriceResult.currency`,
`CmssyPublicCatalogPage.currency` and `CmssyBuyerCatalogPage.currency` name the
page's currency (`null` when the rows are mixed or there are none, which only
happens on a channel in the default currency while a product still carries its
own legacy currency). Amounts are minor units of that currency - divide by its
own number of decimals (`Intl.NumberFormat(locale, { style: "currency",
currency }).resolvedOptions().maximumFractionDigits`), not by 100: JPY has
none. On a channel whose currency is not the default, read listing and product
prices from `public.pricing` / `account.*`, not from the record's price field -
that field holds the default-currency price only.

```ts
import { getPublicCatalogPrices } from "@cmssy/core";

const page = await getPublicCatalogPrices(
  cmssy,
  { modelSlug: "products", limit: 24 },
  { workspaceId, channel: "eu-export" },
);
const format = (minor: number, currency: string) => {
  const nf = new Intl.NumberFormat("de-DE", { style: "currency", currency });
  return nf.format(minor / 10 ** nf.resolvedOptions().maximumFractionDigits!);
};
const cards = page.items.map(({ record, price }) => ({
  id: record.id,
  label: price ? format(price.price, price.currency) : null,
}));
```

The `currency` argument of `getPublicCatalogPrices` / `getBuyerCatalogPrices`
is a row-currency filter for a default-currency channel that still lists
products with their own currency field; a channel in an additional currency
never needs it.

**A cart, its order and everything on them share one currency.**
`Cart.currency` is the first line's currency (`null` while the cart is empty);
lines, shipping, discounts and totals are in it. The order keeps it:
`PublicOrder.currency` names the currency of every amount on the order, and
payments and refunds have no currency of their own - they are always in the
order's currency, as are the amounts of the order webhooks. A fixed-amount
discount code applies only in its own currency and a code with minimum
subtotals only in the currencies they name; elsewhere `applyDiscount` refuses
it with `NOT_APPLICABLE`.

## The rules that still apply

These are the parts the removed helpers got right, and the parts worth copying
rather than reinventing:

1. **The tokens never reach client JS.** Seal them into an httpOnly cookie
   server-side (the demo uses `jose`) and let Server Actions do the talking. A
   token in `localStorage` is readable by any XSS.
2. **Refresh in the middleware, not in a component.** An access token expires
   mid-session, and a proxy that refreshes it and re-writes the cookie is the
   only place that sees every request. See
   [next-storefront's `proxy.ts`](https://github.com/cmssy-io/examples/blob/main/next-storefront/proxy.ts).
3. **`retry` stays off for these calls.** `graphqlRequest` does not retry by
   default precisely because it also carries mutations - a blind-retried
   `register` creates two members.
4. **A signed-out visitor is not an error.** Every one of these calls returns
   `{ success, message }`; render the logged-out state rather than throwing.

## Telling blocks who is signed in

`context.app` is the open channel for exactly this: whatever your app hands
`createCmssyPage` (or `CmssyServerPage` / `CmssyServerLayout`) reaches every
block untouched.

```tsx
export default createCmssyPage(cmssy, blocks, {
  editor: CmssyEditor,
  // A function, not a value: a member fixed at module scope is every visitor's.
  appContext: async () => ({ member: await currentUser() }),
});
```

```tsx
function AccountTeaser({ context }: BlockProps<typeof props>) {
  const member = context?.app?.member;
  return <p>{member ? `Hi, ${member.email}` : "Sign in"}</p>;
}
```
