---
title: Quickstart
description: Build a working headless cmssy site in a Next.js app - config, the catch-all page route, a blocks registry, draft mode, and your first rendered page.
---

# Quickstart

Build a headless site on cmssy: a config, a blocks registry, and a few Next.js
route files. You need a cmssy workspace and its API URL, workspace slug, and a
draft secret.

## 1. Install

```bash
npm i @cmssy/next @cmssy/react
```

## 2. Configure

```ts
// cmssy.config.ts
import type { CmssyNextConfig } from "@cmssy/next";

export const cmssy: CmssyNextConfig = {
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG!,
  draftSecret: process.env.CMSSY_DRAFT_SECRET!,
  defaultLocale: "en",
  enabledLocales: ["en"],
};
```

On cmssy cloud you only set the two per-workspace values. `apiUrl` and
`editorOrigin` are fixed platform values and **default automatically** -
override them only for self-hosted or staging deployments.

| Env var                | What it is                                                                                                                                                                                                    | Required       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `CMSSY_WORKSPACE_SLUG` | The workspace slug (resolves the workspace id).                                                                                                                                                               | yes            |
| `CMSSY_DRAFT_SECRET`   | Server-only secret that gates draft/preview. Copy the generated value from **Settings → Headless** in the cmssy dashboard - it is unique per workspace and must match for the editor's draft preview to work. | yes            |
| `CMSSY_API_URL`        | GraphQL delivery endpoint. Defaults to the cmssy cloud endpoint.                                                                                                                                              | no (self-host) |
| `CMSSY_EDITOR_ORIGIN`  | Origin allowed to frame your app in the editor. Defaults to the cmssy admin.                                                                                                                                  | no (self-host) |

```ts
// self-host / staging only:
export const cmssy: CmssyNextConfig = {
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
import { createCmssyPage } from "@cmssy/next";
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
import { createDraftRoute } from "@cmssy/next";
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
} from "@cmssy/next";
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

## Next steps

- [Authoring a block](../building-blocks/authoring-blocks.md) - build your own components.
- [Server loaders](../building-blocks/server-loaders.md) - fetch block data during SSR.
- [Member auth](../auth/member-auth.md) - sign-in, register, sessions.
- SEO: `buildCmssyMetadata`, `createCmssyRobots`, `createCmssySitemap`.
- i18n: locale middleware + `getCmssyLocale`.

> TODO: a runnable companion project under `examples/quickstart`.
