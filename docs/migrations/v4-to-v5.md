# Migrating to SDK 5

**Run this, then read the rest:**

```bash
npx @cmssy/codemod v5 .
```

It rewrites the imports. Nothing else in your app changes - no new files, no
new wiring. If your 4.x site worked, it will work.

## What changed, and why

Two things had grown into the wrong shape.

**1. The data layer was in a package called `react`.** Fetching a page, reading
site config, talking to the cart, verifying a webhook - none of it touches
React. It lived in `@cmssy/react` because that is where it was written, and the
cost was that a Vue or Astro app had to install React to fetch a page. It now
lives in `@cmssy/core`, and a test fails the build if anything in core ever
imports a framework again.

**2. `@cmssy/next` had one entry for three runtimes.** Middleware runs on the
edge, pages and route handlers run on the server, components run in the
browser - and they cannot share code. That is why `server-only` could never be
placed: we tried, it broke every consumer's middleware, and it was reverted in
4.6.2. Each runtime now has its own entry, and `server-only` finally means
something.

## The import map

| 4.x                                                          | 5.0                       |
| ------------------------------------------------------------ | ------------------------- |
| `createCmssyPage`, `createCmssyEditPage`                     | `@cmssy/next/server`      |
| `buildCmssyMetadata`, sitemap, robots                        | `@cmssy/next/server`      |
| route handlers (`createCmssyAuthRoute`, cart, orders, draft) | `@cmssy/next/server`      |
| `getCmssyUser`, `getCmssyLocale`, `fetchProducts`            | `@cmssy/next/server`      |
| `CmssyLayoutSlot` (was `@cmssy/next/preset`)                     | `@cmssy/next/server`      |
| `createCmssyProxy` (was `@cmssy/next/preset`)                | `@cmssy/next/middleware`  |
| `cmssyEditRewrite`, locale/auth middleware, CSP              | `@cmssy/next/middleware`  |
| `CmssyLink`, `CmssyLocaleProvider`                           | `@cmssy/next/client`      |
| `defineCmssyConfig`, constants, types                        | `@cmssy/next` (unchanged) |

`@cmssy/next/preset` is **gone**. It mixed a middleware export and an RSC export
in one entry, which is the exact thing this release exists to stop.

Two renames, because the names had become lies:

- `CmssyNextConfig` → `CmssyConfig` - nothing about it is Next's.
- `clearCartWorkspaceIdCache` → `clearWorkspaceIdCache` - there were three
  copies of the same cache, two sharing a name. There is one now.

The codemod does all of the above.

## One behaviour change to know about

`fetchProducts` / `fetchProduct` imported from **`@cmssy/next/server`** behave
exactly as before: they still pick up the current request's language.

Imported from **`@cmssy/core`**, they take the locale you pass and nothing else.
Core does not know what a request is - that is the whole point of it.

## Turn on the lint rule

```bash
npm i -D @cmssy/eslint-plugin
```

```js
// eslint.config.mjs
import cmssy from "@cmssy/eslint-plugin";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { cmssy },
    rules: { "cmssy/no-server-config-in-client": "error" },
  },
];
```

This catches the one failure `server-only` cannot, because the chain runs
through **your** files, not ours:

```
editor.tsx ("use client")  ->  lib/locale.ts  ->  cmssy.config.ts  ->  process.env
```

Nothing in that chain imports a server-only module, and it took a live site down
(CMS-968). The rule follows the chain and prints it.

## Then prove the editor still works

A build cannot tell you whether the editor lives, and an editor that died in a
migration looks exactly like one that works - until someone opens it.

```ts
import { checkCmssyEditMode } from "@cmssy/next/testing";

const result = await checkCmssyEditMode({
  baseUrl,
  secret: process.env.CMSSY_DRAFT_SECRET,
});
expect(result.failures).toEqual([]);
```

Run it against a started production build. See [testing](../testing.md).
