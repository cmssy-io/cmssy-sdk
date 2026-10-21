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
| `account.profile(workspaceId)`                             | `id`, `login`, `pendingLogin`, `data`, `editableFields`, `loginField`, `passwordField` |
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
