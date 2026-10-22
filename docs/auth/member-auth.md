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

Signing in, signing out or a change to the member's price list can move the
cart's prices after the buyer saw them. Checkout then refuses rather than
charging a total nobody showed. `checkoutErrorReason(error)` from `@cmssy/core`
names the case; `CmssyGraphqlError.reason` carries the raw value.

| Reason                  | What happened                                                         | What to do                                                       |
| ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `CART_REPRICED`         | The buyer's prices changed since the cart was read                    | Read the cart again, show the new total, let the buyer check out |
| `CART_CURRENCY_CHANGED` | The buyer's price list prices a line in another currency than the cart | Remove that line (`extensions.itemId`) and add the product again |
| `BUYER_CHANGED`         | The cart was restamped for another buyer (company switch, guest cart bound at sign-in) | Read the cart again, show the new total, let the buyer check out |
| `PRODUCT_NOT_SOLD`      | A line's product is no longer sold                                    | Remove that line (`extensions.itemId`)                           |
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
