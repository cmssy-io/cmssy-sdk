---
title: Member auth
description: Authenticate site members with secure httpOnly-cookie sessions - sign-in, register, password reset, and reading the current member server-side.
---

# Member auth

> Status: outline (CMS-773). APIs below are accurate. Blocked on the block-context
> auth gap (CMS-775) before the client-block half is final.

cmssy issues member sessions as **httpOnly cookies** (`cmssy_session`, sealed
JWE). Never store member tokens in `localStorage` - they would be readable by
any XSS. The SDK handles sealing, refresh, and the `Authorization: Bearer`
exchange server-side.

## Configure

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

## Mount the auth route

```ts
// app/api/auth/[action]/route.ts
import { createCmssyAuthRoute } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export const { POST, GET } = createCmssyAuthRoute(cmssy);
```

Actions:

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

A client sign-in form `POST`s credentials to `/api/auth/sign-in`; the cookie is
set by the route. No token touches client JavaScript.

## Read the current member (server-side)

```ts
import { getCmssyUser, getCmssyAccessToken } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

const user = await getCmssyUser(cmssy); // { recordId, email } | null
```

Use `createCmssyAuthMiddleware(cmssy)` to refresh sessions transparently.

## Reading auth inside a block

> TODO (blocked by CMS-775): blocks currently read `context.auth`, but the
> injected `CmssyBlockContext` has no `auth` field, so member state is always
> undefined in blocks. The supported pattern - extend the block context from
> `getCmssyUser`, or fetch `/api/auth/me` client-side - is being decided.

## Anti-pattern (do not do this)

```ts
// ❌ token readable by any XSS, and bypasses the secure cookie flow
localStorage.setItem("site_customer_token", accessToken);
```

Always go through `createCmssyAuthRoute`.
