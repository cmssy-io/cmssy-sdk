---
title: Member auth
description: Authenticate site members with secure httpOnly-cookie sessions - sign-in, register, password reset, reading the current member, and using auth from a block.
---

# Member auth

cmssy issues member sessions as **httpOnly cookies** (`cmssy_session`, a sealed
JWE). Never store member tokens in `localStorage` - they are readable by any XSS.
The SDK handles sealing, refresh, and the `Authorization: Bearer` exchange
server-side; your client code never touches a token.

## 1. Configure

```ts
// cmssy.config.ts
export const cmssy: CmssyNextConfig = {
  // ...
  auth: {
    modelSlug: "members", // the member model in your workspace
    sessionSecret: process.env.CMSSY_SESSION_SECRET!, // >= 32 chars
  },
};
```

`auth` is optional - omit it and member auth is simply off (`context.auth` is
`undefined`, blocks render logged-out).

## 2. Mount the auth route

```ts
// app/api/auth/[action]/route.ts
import { createCmssyAuthRoute } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export const { POST, GET } = createCmssyAuthRoute(cmssy);
```

| Method + action                      | Body                             | Effect                                  |
| ------------------------------------ | -------------------------------- | --------------------------------------- |
| `POST /api/auth/sign-in`             | `{ identity, password }`         | Sets the session cookie.                |
| `POST /api/auth/register`            | `{ identity, password, fields }` | Creates a member.                       |
| `POST /api/auth/sign-out`            | -                                | Clears the session.                     |
| `POST /api/auth/sign-out-everywhere` | -                                | Revokes all sessions.                   |
| `POST /api/auth/refresh`             | -                                | Rotates tokens.                         |
| `POST /api/auth/forgot-password`     | `{ identity }`                   | Sends a reset.                          |
| `POST /api/auth/reset-password`      | `{ token, newPassword }`         | Resets a password.                      |
| `POST /api/auth/verify-email`        | `{ token }`                      | Verifies an email.                      |
| `GET  /api/auth/me`                  | -                                | Returns `{ user }` or `{ user: null }`. |

Every action returns JSON `{ ok: boolean, message?, user? }`. The route is the
only place credentials/tokens are handled - clients just POST.

## 3. Refresh sessions in middleware

```ts
// middleware.ts
import { createCmssyAuthMiddleware } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export const middleware = createCmssyAuthMiddleware(cmssy);
```

This transparently refreshes an expiring session cookie on navigation.

## 4. Read the current member (server-side)

```ts
import { getCmssyUser, getCmssyAccessToken } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

const user = await getCmssyUser(cmssy); // { recordId, email } | null
```

## 5. Read auth inside a block

When `config.auth` is set, `createCmssyPage` resolves the member server-side and
injects it into the block context as `context.auth` (data only):

```ts
context.auth; // { isAuthenticated: boolean; member: { recordId, email } | null } | undefined
```

```tsx
function AccountBadge({
  context,
}: {
  context?: { auth?: CmssyBlockAuthContext };
}) {
  if (!context?.auth?.isAuthenticated) return <a href="/login">Sign in</a>;
  return <span>{context.auth.member?.email}</span>;
}
```

`context.auth` is **data only** - there are no `login`/`logout` functions on it
(functions can't cross the server→client boundary into a client block). Sign in,
out, register etc. are client POSTs to `/api/auth/*`:

```tsx
// sign-in form
await fetch("/api/auth/sign-in", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password }),
});
// the cookie is set by the route - then redirect

// logout
await fetch("/api/auth/sign-out", { method: "POST" });
```

## 6. Authenticated member requests

A member-scoped GraphQL mutation (e.g. updating a profile) needs the access
token, which lives in the httpOnly cookie - **unreadable from client JS by
design**. Don't try to attach it client-side. Instead call it from a server
action / route handler that reads the token:

```ts
// app/actions/update-profile.ts
"use server";
import { getCmssyAccessToken } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export async function updateProfile(input: ProfileInput) {
  const token = await getCmssyAccessToken(cmssy);
  if (!token) throw new Error("not authenticated");
  // forward to the delivery API with `Authorization: Bearer ${token}`
}
```

## Anti-pattern

```ts
// ❌ XSS-readable, and bypasses the secure cookie flow entirely
localStorage.setItem("site_customer_token", accessToken);
```

Always go through `createCmssyAuthRoute` + the httpOnly cookie. See the cmssy-web
auth blocks (`login-form`, `register-form`, `forgot-password-form`,
`customer-profile`) for the full client pattern.
