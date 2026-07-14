# Reference wiring

The complete, correct way to mount cmssy in a Next.js app. Copy it whole - the
pieces depend on each other, and the dependencies are not obvious.

## The mental model

Three request shapes reach your app, and they need three different things:

| Request                                                      | What it must render                                              | Why                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A visitor                                                    | published content, server-rendered, static where possible        | speed, and the CMS staying out of the render path                               |
| Draft preview (the `/api/draft` cookie)                      | **draft** content on the **public** route, no editor             | someone reviewing a change, not editing it                                      |
| The editor iframe (`cmssyEdit=1` + a matching `cmssySecret`) | draft content **plus** the edit bridge, on its own dynamic route | a static page never sees the query string, so it cannot know it is being edited |

The third one is why `/cmssy-edit` exists. Everything below follows from it.

## 1. Config

```ts
// cmssy.config.ts
import { defineCmssyConfig } from "@cmssy/next";

export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
});
```

Pass `process.env` **raw**. A `?? ""` fallback turns a missing variable into an
empty one, and the error surfaces later, somewhere unrelated.

> This module reads server env. Never import a **value** from it - or from a
> module that imports it - in a `"use client"` component. Types are fine; they
> are erased. Values drag `process.env` into the browser bundle.

## 2. Middleware

```ts
// proxy.ts
import { createCmssyProxy } from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy.config";

export const proxy = createCmssyProxy(cmssy, {
  // Only if your URLs carry the language (/no/about) AND your routes are static
  // paths rather than a catch-all.
  stripLocalePrefix: true,
});

// Next parses this at compile time, so the matcher must be a literal - an
// imported constant is rejected.
export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
```

The preset resolves the language, sends verified editor traffic to `/cmssy-edit`
carrying that language **and** the edit flag, applies the CSP that lets the admin
frame your site, and strips a language prefix if you asked. In that order,
because the order is what makes it correct.

## 3. The public page

```tsx
// app/[[...path]]/page.tsx
import { buildCmssyMetadata, createCmssyPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export async function generateMetadata({ params }) {
  const { path } = await params;
  // As routed, prefix and all: the prefix IS the language.
  return buildCmssyMetadata(cmssy, path);
}

export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
```

## 4. The edit route

```tsx
// app/cmssy-edit/[[...path]]/page.tsx
import { createCmssyEditPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export const dynamic = "force-dynamic";

export default createCmssyEditPage(cmssy, blocks, { editor: CmssyEditor });
```

Skip this file and the editor preview is blank. That is the single most common
way to break a cmssy app.

## 5. The chrome (header and footer)

They are layout **blocks**, so they must be editable like any other block:

```tsx
// cmssy/editable-layout.tsx
"use client";
import {
  CmssyLazyLayout,
  type CmssyLazyLayoutProps,
} from "@cmssy/react/client";

export function EditableLayout(props: Omit<CmssyLazyLayoutProps, "load">) {
  return <CmssyLazyLayout {...props} load={() => import("./blocks")} />;
}
```

```tsx
// app/layout.tsx
import { CmssyChrome } from "@cmssy/next/server";

<CmssyChrome config={cmssy} blocks={blocks} position="header" editable={EditableLayout} />
<main>{children}</main>
<CmssyChrome config={cmssy} blocks={blocks} position="footer" editable={EditableLayout} />
```

`CmssyChrome` renders them server-side for visitors, and through the edit bridge
(with the draft, behind the preview secret) in the editor.

## 6. The editor bridge

```tsx
// cmssy/editor.tsx
"use client";
import { CmssyLazyEditor } from "@cmssy/react/client";
import type { CmssyEditorProps } from "@cmssy/next";

export function CmssyEditor(props: CmssyEditorProps) {
  return <CmssyLazyEditor {...props} load={() => import("./blocks")} />;
}
```

The registry is loaded lazily **on the client**, so your block loaders (which run
server-side and read the config) never reach the browser bundle.

## 7. SEO

```ts
// app/sitemap.ts
export default createCmssySitemap(cmssy);

// app/robots.ts
export default createCmssyRobots(cmssy);
```

Rendering products or categories from model records? They are not pages, so add
them through `extra` - it receives the same `baseUrl` and locales the page
entries use, so the two cannot disagree.

## 8. Prove the editor still works

```ts
const result = await checkCmssyEditMode({
  baseUrl,
  secret: process.env.CMSSY_DRAFT_SECRET,
});
expect(result.failures).toEqual([]);
```

A build proves the site compiles. It says nothing about whether the site can be
**edited** - and that is the part that breaks silently. See
[testing](testing.md).
