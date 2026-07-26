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
[cmssy-demo](https://github.com/cmssy-io/cmssy-demo) -
[`services/auth.ts`](https://github.com/cmssy-io/cmssy-demo/blob/main/services/auth.ts),
[`lib/cmssy/session-crypto.ts`](https://github.com/cmssy-io/cmssy-demo/blob/main/lib/cmssy/session-crypto.ts),
[`lib/actions/auth.ts`](https://github.com/cmssy-io/cmssy-demo/blob/main/lib/actions/auth.ts).

## The mutations

All of them live under `siteMember` and take the member `modelSlug` from your
workspace:

| Mutation              | Input                                       | Returns                                               |
| --------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `siteMember.login`    | `{ modelSlug, identity, password }`         | `accessToken`, `refreshToken`, `accessTokenExpiresIn` |
| `siteMember.register` | `{ modelSlug, identity, password, fields }` | `success`, `message`                                  |
| `siteMember.refresh`  | `refreshToken`                              | a rotated token pair                                  |
| `siteMember.logout`   | `refreshToken`                              | `success`, `message`                                  |

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

## The rules that still apply

These are the parts the removed helpers got right, and the parts worth copying
rather than reinventing:

1. **The tokens never reach client JS.** Seal them into an httpOnly cookie
   server-side (the demo uses `jose`) and let Server Actions do the talking. A
   token in `localStorage` is readable by any XSS.
2. **Refresh in the middleware, not in a component.** An access token expires
   mid-session, and a proxy that refreshes it and re-writes the cookie is the
   only place that sees every request. See
   [cmssy-demo's `proxy.ts`](https://github.com/cmssy-io/cmssy-demo/blob/main/proxy.ts).
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
