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

| Env var                | What it is                                                                                                                                                                                                    | Required       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `CMSSY_ORG_SLUG`       | The organization slug (part of the org-scoped delivery path).                                                                                                                                                 | yes            |
| `CMSSY_WORKSPACE_SLUG` | The workspace slug (unique within the organization).                                                                                                                                                          | yes            |
| `CMSSY_DRAFT_SECRET`   | Server-only secret that gates draft/preview. Copy the generated value from **Settings → Headless** in the cmssy dashboard - it is unique per workspace and must match for the editor's draft preview to work. | yes            |
| `CMSSY_API_URL`        | GraphQL delivery endpoint. Defaults to the cmssy cloud endpoint.                                                                                                                                              | no (self-host) |
| `CMSSY_EDITOR_ORIGIN`  | Origin allowed to frame your app in the editor. Defaults to the cmssy admin.                                                                                                                                  | no (self-host) |
| `CMSSY_API_TOKEN`      | A `cs_…` API token used only in development to preview in-progress editor edits (dev drafts) on your local site. See [Dev preview](#7-dev-preview-optional). Server-only; ignored in production.              | no (dev only)  |

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

The cmssy editor frames this page with `?cmssyEdit=1`; `createCmssyPage` then
mounts the edit bridge and serves draft content using the server-side
`draftSecret` (no secret reaches the editor). Without the flag it serves
published content.

## 5. Enable draft mode

```ts
// app/api/draft/route.ts
import { createDraftRoute } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";

export const GET = createDraftRoute(cmssy);
```

## 6. Let the editor frame your app

```ts
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import {
  applyCmssyCsp,
  isCmssyEditRequest,
  CMSSY_EDIT_HEADER,
} from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy.config";

export function middleware(request: NextRequest) {
  const editMode = isCmssyEditRequest(request);

  // Strip any inbound value so a client can't forge edit mode, then set it
  // ourselves so server components (e.g. the root layout) can read it.
  const headers = new Headers(request.headers);
  headers.delete(CMSSY_EDIT_HEADER);
  if (editMode) headers.set(CMSSY_EDIT_HEADER, "1");

  const response = NextResponse.next({ request: { headers } });
  if (editMode) applyCmssyCsp(response, { editorOrigin: cmssy.editorOrigin });
  return response;
}
```

In a server component (e.g. the root `layout.tsx`), read `isCmssyEditMode()` to
fetch draft vs published data on the same signal.

> **Security.** `?cmssyEdit=1` is a developer-controllable flag - any request can
> opt into edit mode. This is not an escalation: draft **content** is still gated
> by the server-held `draftSecret`, and `frame-ancestors` only restricts framing
> to your `editorOrigin` (set it to a concrete origin, never `*`). For
> production, gate the edit path behind a server-set capability (auth/session
> cookie or signed token) and scope this middleware with `config.matcher` to
> editable routes only.

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
whose role grants the dev-preview permission. A token from any other user
authenticates but silently falls back to published content.

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
- [Member auth](../auth/member-auth.md) - sign-in, register, sessions.
- SEO: `buildCmssyMetadata`, `createCmssyRobots`, `createCmssySitemap`.
- i18n: locale middleware + `getCmssyLocale`.

## Runnable example

[cmssy-next-starter](https://github.com/cmssy-io/cmssy-next-starter) is a complete, deployable
Next.js app wired with this SDK (catch-all page, draft route, edit-mode proxy, block registry) plus
example blocks. Clone it or use the 1-click Vercel deploy as a starting point.
