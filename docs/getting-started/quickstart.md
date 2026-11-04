---
title: Quickstart
description: Build a working headless cmssy site in a Next.js app - config, the catch-all page route, a blocks registry, draft mode, and your first rendered page.
---

# Quickstart

Build a headless site on cmssy: a config, a blocks registry, and a few Next.js
route files. You need a cmssy workspace and its API URL, workspace slug, and a
draft secret.

## 1. Install

Create the app with your framework's own CLI, then let `cmssy init` generate
the cmssy wiring - config, block registry, catch-all page, edit route, draft
route and proxy - for the framework it detects:

```bash
npx create-next-app@latest my-site   # or: npm create astro@latest / npx create-react-router@latest
cd my-site
npx @cmssy/cli init

# or wire it by hand:
npm i @cmssy/core @cmssy/react @cmssy/next
```

Then connect the app to your workspace with [`cmssy link`](../cli.md) instead
of hand-copying values from the dashboard - it writes `CMSSY_ORG_SLUG`,
`CMSSY_WORKSPACE_SLUG` and `CMSSY_DRAFT_SECRET` into `.env.local`, sets the
workspace preview URL, verifies the wiring and prints the editor deep link:

```bash
npx @cmssy/cli link --token cs_...
```

## 2. Configure

```ts
// cmssy.config.ts
import { defineCmssyConfig } from "@cmssy/next";

export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
});
```

On cmssy cloud you only set the two per-workspace values. `apiUrl` and
`editorOrigin` are fixed platform values and **default automatically** -
override them only for self-hosted or staging deployments.

| Env var                | What it is                                                                                                                                                                                                                                              | Required       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `CMSSY_ORG_SLUG`       | The organization slug (part of the org-scoped delivery path).                                                                                                                                                                                           | yes            |
| `CMSSY_WORKSPACE_SLUG` | The workspace slug (unique within the organization).                                                                                                                                                                                                    | yes            |
| `CMSSY_DRAFT_SECRET`   | Server-only secret that gates draft/preview. Copy the generated value from **Settings → Headless** in the cmssy dashboard - it is unique per workspace and must match for the editor's draft preview to work.                                           | yes            |
| `CMSSY_API_URL`        | GraphQL delivery endpoint. Defaults to the cmssy cloud endpoint.                                                                                                                                                                                        | no (self-host) |
| `CMSSY_EDITOR_ORIGIN`  | Origin allowed to frame your app in the editor, or several separated by commas (`https://admin.example.com,https://www.admin.example.com`). Setting it replaces the cmssy admin defaults, so list every origin you still need, `www` variants included. | no (self-host) |
| `CMSSY_API_TOKEN`      | A `cs_…` API token used only in development to preview in-progress editor edits (dev drafts) on your local site. See [Dev preview](#7-dev-preview-optional). Server-only; ignored in production.                                                        | no (dev only)  |

```ts
// self-host / staging only:
export const cmssy: CmssyConfig = {
  org: process.env.CMSSY_ORG_SLUG!,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG!,
  draftSecret: process.env.CMSSY_DRAFT_SECRET!,
  apiUrl: process.env.CMSSY_API_URL!, // e.g. http://localhost:4000/graphql
  editorOrigin: process.env.CMSSY_EDITOR_ORIGIN!, // your admin origin
};
```

## 3. Register your blocks

Define blocks with `defineBlock` (see [Authoring a block](../building-blocks/authoring-blocks.md))
and collect them in one array:

```ts
// cmssy/blocks.ts
import { heroBlock } from "@/blocks/hero/block";

export const blocks = [heroBlock];
```

## 4. Render pages

`createCmssyPage(config, blocks, options?)` returns a Next.js page handler for a
catch-all route. **`blocks` is required** - it is how the renderer maps each
stored block to your component. Pass an `editor` so the page can be edited
visually; **edit mode throws without it**.

The editor is a small `"use client"` component that lazy-loads your blocks:

```tsx
// cmssy/editor.tsx
"use client";

import { CmssyLazyEditor } from "@cmssy/react/client";
import type { CmssyEditorProps } from "@cmssy/next";

export function CmssyEditor(props: CmssyEditorProps) {
  return <CmssyLazyEditor {...props} load={() => import("./blocks")} />;
}
```

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
```

This route serves **published** content only. A page that exists in the
workspace but is not published answers 404 here - publish it in the editor (or
with the `publish_page` MCP tool) before you open its public URL.

It does **not** handle the editor. `createCmssyPage` ignores `?cmssyEdit=1`;
the editor gets its own route and a proxy that sends it there (step 6).

## 5. Enable draft mode

```ts
// app/api/draft/route.ts
import { createDraftRoute } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";

export const GET = createDraftRoute(cmssy);
```

This route also lets you **preview drafts without the editor**: open
`/api/draft?secret=<your CMSSY_DRAFT_SECRET>&redirect=/` on any host running
your app - the deployed site or `localhost` during development - and the site
renders draft content until you exit with `/api/draft?disable=1`. `cmssy link`
prints this URL ready to open.

`cmssy init` also writes `app/api/revalidate/route.ts`. Once your page passes
`cache: { revalidate }` (the [wiring guide](../wiring.md) §5 shows where) and a
`content.changed` webhook points at that route, a publish shows up on the next
request instead of after `revalidate` seconds.

## 6. Give the editor its own route

The cmssy editor frames your site at the page's own URL with
`?cmssyEdit=1&cmssySecret=<draft secret>`. A static public page never sees that
query string, so the editor needs two more files. **Both are required** -
without either one the editor shows "the preview did not respond".

The edit route renders draft content with the edit bridge:

```tsx
// app/cmssy-edit/[[...path]]/page.tsx
import { createCmssyEditPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export const dynamic = "force-dynamic";

export default createCmssyEditPage(cmssy, blocks, { editor: CmssyEditor });
```

The proxy verifies the secret, rewrites `/about?cmssyEdit=1&cmssySecret=…` to
`/cmssy-edit/about`, and sets the CSP that lets the cmssy admin frame the page:

```ts
// proxy.ts (Next.js 16) - on Next.js 15 name it middleware.ts and export `middleware`
import { createCmssyProxy } from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy.config";

export const proxy = createCmssyProxy(cmssy);

export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
```

Put `proxy.ts` next to your `app` directory: the project root, or `src/` when
the app lives in `src/app`. Keep `matcher` a literal - Next parses it at build
time and rejects an imported constant.

Then set the workspace **preview URL** (Settings → Headless, or `cmssy link`)
to the exact deployed origin, e.g. `https://my-site.vercel.app` - no extra
`www.` and no path.

On the `/cmssy-edit` route read `isCmssyEditMode()` to fetch draft rather than
published data. Do **not** read it on a public route: it calls `headers()`, and
one such read makes the route uncacheable for good.

> **Security.** A bare `?cmssyEdit=1` does not enter edit mode: the proxy
> rewrites only when `cmssySecret` matches your server-held `draftSecret`, and
> `/cmssy-edit` itself answers 404 to any request without a matching secret.

That is a working headless site: published pages render server-side, and editors
arrange your blocks visually through the cmssy editor.

## 7. Dev preview (optional)

While building blocks locally you often want to see **in-progress** editor edits
on your own running site before they are published. The editor's **dev-mode**
toggle controls this, and your local app opts in with a `devToken`:

```ts
// cmssy.config.ts - development only
export const cmssy: CmssyConfig = {
  org: process.env.CMSSY_ORG_SLUG!,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG!,
  draftSecret: process.env.CMSSY_DRAFT_SECRET!,
  devToken: process.env.CMSSY_API_TOKEN, // a cs_… token from the dashboard's API Tokens page
};
```

Create the token on the **API Tokens** page in the cmssy dashboard. It must
belong to a user with dev-preview access - the workspace **owner**, or a member
whose role grants the `site:preview_dev` permission. A token from any other
user is refused for dev preview: the SDK renders the published page and warns
once in the dev server console naming the missing permission.

How it works: when `NODE_ENV === "development"` **and** a `devToken` is set, the
SDK sends the token on every page fetch. The backend resolves it to that user and
checks the user's dev-preview flag - the switch on the editor's dev-mode control.
Content is chosen **server-side**:

| Editor dev-mode | Dev draft saved? | Your local site renders |
| --------------- | ---------------- | ----------------------- |
| off             | -                | published               |
| on              | no               | published               |
| on              | yes              | the dev-draft overlay   |

Toggle dev-mode in the editor, then refresh your local site to see the change.
There is no URL flag - the editor is the single control, per user.

> **Scope.** The token is read only in development and never reaches the browser
> (it is sent server-to-server on the delivery fetch). A production build ignores
> `devToken` entirely, so leaving `CMSSY_API_TOKEN` in a deploy env is inert - but
> prefer scoping it to local `.env` files. The overlay reflects the **token
> user's** saved dev draft (shown to whoever loads that dev server); it never
> changes published content.

## Next steps

- [Authoring a block](../building-blocks/authoring-blocks.md) - build your own components.
- [Server loaders](../building-blocks/server-loaders.md) - fetch block data during SSR.
- [Member auth](../auth/member-auth.md) - sign-in, register, sessions (app-owned since 10.0).
- SEO - your own `generateMetadata`, `app/sitemap.ts` and `app/robots.ts`: see the
  [recipe](../building-blocks/recipes.md#seo-metadata).
- i18n - `createCmssyProxy` resolves the language; the routed path carries it.

## Runnable example

[simple-blog](https://github.com/cmssy-io/examples/tree/main/simple-blog) is a complete, deployable
Next.js app wired with this SDK (catch-all page, draft route, edit-mode proxy, block registry,
layout slot) plus example blocks and the `graphql/` → codegen → `services/` data layer the SDK
expects you to own. Clone it or use the 1-click Vercel deploy as a starting point.
