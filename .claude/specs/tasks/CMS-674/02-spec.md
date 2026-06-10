# Task Specification — CMS-674: SDK BFF in @cmssy/next (JWE session, auth routes, hooks)

Parent epic: CMS-670 Track B. Depends on CMS-673 (backend auth — merged: `siteMemberRegister/Login/VerifyEmail/ForgotPassword/ResetPassword/Refresh/Logout/LogoutEverywhere` GraphQL mutations on cmssy main).

Repo: **cmssy-sdk** (`packages/next` + `packages/react`). PRs → `main` of cmssy-io/cmssy-sdk. Review loop: same two-Claude pattern as CMS-673 (spawn script + brief in this repo's `.claude/`).

## Problem

Custom domains kill every cross-origin-cookie option — the browser must talk only to the consumer's own Next.js server. The cmssy access/refresh tokens must NEVER be observable in the browser. So `@cmssy/next` ships a Backend-for-Frontend: first-party route handlers that call the cmssy GraphQL auth API server-side and keep tokens inside an encrypted, HTTP-only cookie on the consumer domain.

## Backend contract (CMS-673, already shipped)

- Mutations (all on `config.apiUrl` GraphQL): `siteMemberLogin(input:{modelSlug,identity,password})` / `siteMemberRegister(input:{modelSlug,identity,password,fields})` / `siteMemberRefresh(refreshToken)` / `siteMemberLogout(refreshToken)` / `siteMemberLogoutEverywhere` (needs `Authorization: Bearer <access>`) / `siteMemberVerifyEmail(token)` / `siteMemberForgotPassword(modelSlug,identity)` / `siteMemberResetPassword(token,newPassword)`.
- Login/refresh return `{success,message,accessToken,refreshToken,accessTokenExpiresIn}`.
- **Workspace binding:** resolvers read `context.workspaceId` → the BFF must send `x-workspace-id` on every auth call. Resolve once via the existing `resolveWorkspaceId()` (`@cmssy/react` settings-client) and cache per server instance.
- Access JWT ~15 min `{type:"site_member", modelId, recordId, workspaceId, email, tokenVersion}`; refresh ~30d rotating (`familyId`/`gen`, replay → family revoked). A failed refresh = session dead, clear cookie.

## Design

### Session cookie (the heart)

- Name: `cmssy_session`. Flags: `HttpOnly; Secure; SameSite=Lax; Path=/`. `Secure` omitted only when `NODE_ENV==="development"`.
- Content: **JWE** (jose, `alg:"dir"`, `enc:"A256GCM"`) over payload `{ accessToken, refreshToken, accessExpiresAt /*epoch ms*/, user: { recordId, email } }`.
- Key: consumer secret — config field `sessionSecret` (consumer passes e.g. `process.env.CMSSY_SESSION_SECRET`). Derive the 32-byte key via SHA-256 of the secret (accepts any length ≥ 32 chars; reject shorter at handler-creation time, mirroring `createDraftRoute`'s MIN_SECRET_LENGTH guard).
- Cookie `Max-Age` = 30d (refresh lifetime). The access expiry lives INSIDE the payload (`accessExpiresAt`), checked server-side.
- Decrypt failure (tampered/wrong key/expired JWE) → treat as signed-out, clear cookie. Never throw to the page.

### Config additions (`CmssyNextConfig`)

```ts
auth?: {
  modelSlug: string;        // the auth-enabled model (e.g. "members")
  sessionSecret: string;    // >=32 chars, JWE key material
}
```

`createCmssyAuthRoute` throws at creation when `auth` is missing/invalid (fail fast, like draftSecret).

### Route handlers — `createCmssyAuthRoute(config)`

Mirrors `createDraftRoute` factory style. Consumer mounts ONE catch-all:

```ts
// app/api/cmssy/auth/[action]/route.ts
import { cmssy } from "@/cmssy/config";
import { createCmssyAuthRoute } from "@cmssy/next";
export const { POST, GET } = createCmssyAuthRoute(cmssy);
```

Actions (`[action]` segment):

- `POST sign-in {identity,password}` → backend login → on success seal cookie → `{ok:true, user}` (NO tokens in body).
- `POST register {identity,password,fields?}` → backend register → `{ok,message}` (no auto-login when verification required; if backend returned tokens-less success just relay).
- `POST sign-out` → read cookie → backend `siteMemberLogout(refreshToken)` (fire-and-forget) → clear cookie → `{ok:true}`.
- `POST sign-out-everywhere` → backend `siteMemberLogoutEverywhere` with Bearer access → clear cookie.
- `POST refresh` → rotate via backend → re-seal cookie → `{ok, user}`; on failure clear cookie + `{ok:false}` 401.
- `POST forgot-password {identity}` / `POST reset-password {token,newPassword}` / `POST verify-email {token}` → relay, generic responses.
- `GET me` → `getUser()` semantics over HTTP for the client provider → `{user}` or `{user:null}`.
- Unknown action → 404. All responses `cache-control: no-store`.

**CSRF stance:** SameSite=Lax + all mutations POST + JSON body (no form-encoded) = solid baseline for same-origin apps; document it. No CSRF token in v1 (consumer apps are first-party only).

### Server read — `getCmssyUser(config)` (NO refresh in RSC — replay-safety invariant)

**Invariant: the backend refresh mutation is called ONLY from contexts that can persist the rotated cookie** (route handlers, server actions, middleware). A refresh whose result isn't persisted leaves the cookie holding the old `gen`; the next refresh with that stale gen trips CMS-673's replay detection → the whole family is revoked → forced logout. So pure-RSC `getCmssyUser` NEVER rotates.

1. Read + decrypt cookie (via `next/headers cookies()`).
2. `accessExpiresAt > now + 30s` → return the session user.
3. Expired in pure RSC → return `null` (render signed-out). Recovery paths that DO rotate + persist: the middleware (refreshes before RSC runs, so RSC sees a fresh cookie) and the client provider (`GET me` route refreshes server-side and re-seals). Install guide states plainly: **add the middleware for seamless SSR sessions**; without it a user idle past 15 min SSR-renders signed-out until the client provider refreshes.
4. Decrypt failure → null.

Public exported shape: `getCmssyUser(config): Promise<CmssySessionUser | null>` where `CmssySessionUser = { recordId, email }`. A separate `getCmssyAccessToken(config)` (server-only) returns the raw access token for consumers needing direct authed calls — never importable into client bundles (`server-only` import guard).

### Middleware helper — `createCmssyAuthMiddleware(config)` (optional for consumers)

Edge-safe (jose works on edge): decrypt → if access expired and refresh present → refresh → re-seal on the response (middleware CAN write cookies, closing the RSC gap above). Recommend consumers add it; not required for basic flows.

### Client API (`@cmssy/react` client surface, re-exported via `@cmssy/next`)

- `<CmssyAuthProvider basePath="/api/cmssy/auth">` — fetches `GET me` once, holds `{user, loading}`.
- `useCmssyUser()` → `{ user, loading, signIn(identity,password), signOut(), register(...), refresh() }` — all hit the consumer's own `basePath` routes (first-party fetch, `credentials:"same-origin"`).
- Naming: `Cmssy*` prefix everywhere (no generic `useUser` — collision-prone in consumer apps).
- Goes into `packages/react/src/client.ts` ("use client" bundle) and ships from **`@cmssy/react/client`** — the same subpath the editor client components already use. NOT re-exported through `@cmssy/next` (that's the server-graph bundle; forcing a `"use client"` module through it risks server-graph pollution). Consumer import split: provider/hook from `@cmssy/react/client`; routes (`createCmssyAuthRoute`) + server reads (`getCmssyUser`) + middleware from `@cmssy/next`.

### What stays out of scope

- OAuth strategy (backend stub) — future.
- Full GraphQL proxy for arbitrary authed queries — only the auth actions + `getCmssyAccessToken` escape hatch ship now; a generic `/api/cmssy/proxy` can come when an authed-content use case lands.
- Per-request CSRF tokens.

## Slices (each own PR → cmssy-sdk main)

- **Slice 1 — session core (packages/next):** `jose` dep; `session.ts` (seal/open JWE, key derivation, payload type, clock-skew guard); config `auth` field + validation; unit tests (round-trip, tamper, wrong key, expired access detection, short-secret rejection).
- **Slice 2 — BFF routes + server read:** `auth-client.ts` (server-side GraphQL calls to the CMS-673 mutations incl. `x-workspace-id` resolution+cache); `createCmssyAuthRoute` (all actions, cookie set/clear, no-store); `getCmssyUser`/`getCmssyAccessToken` with lazy refresh; `createCmssyAuthMiddleware`. Tests: every action happy+failure, refresh rotation persisted, failed refresh clears cookie, tokens never in any response body.
- **Slice 3 — client API + pilot:** `CmssyAuthProvider` + `useCmssyUser` (react/client.ts); `@cmssy/next` re-exports; bump both packages 0.1.9; wire into kancelaria pilot (sign-in page on the auth model) and verify e2e in the browser (cookie first-party HttpOnly, no token in devtools network/storage, SSR `getCmssyUser` renders the user, sign-out revokes); tag `v0.1.9`.

## Done when

Consumer app: `signIn` → HTTP-only first-party cookie → authed calls via BFF → `getCmssyUser()` SSR-renders the user → `signOut` clears + revokes. Token never observable in the browser. Both packages typecheck+tests green; pilot verified.

## Open questions

- `GET me` response caching: any consumer CDN risk → forced `no-store` enough? (assumed yes)
