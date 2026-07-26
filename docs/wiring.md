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
import { createCmssyPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";
import { buildPageMetadata } from "@/services/seo";

export async function generateMetadata({ params }) {
  const { path } = await params;
  // As routed, prefix and all: the prefix IS the language.
  return buildPageMetadata(path);
}

export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
```

`buildPageMetadata` is **your** function - since 10.0 the SDK ships no page-SEO
helper (see [§7](#7-seo)). The rule it has to keep is the one above: pass the
segments as routed. Strip the language prefix first and every translation gets
the default language's title and a canonical pointing at the default language's
URL, which tells Google the translation is a duplicate.

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

## 5. The header and footer

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

The slot that mounts them is yours (10.0 removed `CmssyLayoutSlot`, which fetched
and rendered them for you). It has three jobs, and each one is a way to break the
editor silently:

```tsx
// cmssy/layout-slot.tsx
export async function CmssyLayoutSlot({ position, path }) {
  const editMode = await isCmssyEditMode();

  // 1. In edit mode, fetch with the preview secret - otherwise the editor shows
  //    the PUBLISHED header while you edit the draft one.
  const groups = await fetchChromeLayouts(
    "/",
    editMode ? cmssy.draftSecret : undefined,
  );

  // 2. The language comes from the routed path. Reading it from the request
  //    header instead forces every page dynamic and gives up ISR.
  const { locale } = splitLocaleFromPath(path, siteLocales);

  if (!editMode) {
    return <CmssyServerLayout groups={groups} blocks={blocks} position={position} … />;
  }

  // 3. In edit mode they go through the bridge, with the server-resolved
  //    content - the canvas renders stored content, and a relation field there
  //    is raw ids. Server-rendered instead, the editor can select the header
  //    and has no fields to show for it.
  const data = await resolveEditorLayoutBlockData({ groups, blocks, position, … });
  return <EditableLayout groups={groups} position={position} data={data.data}
    resolvedContent={data.content} … />;
}
```

Mount it in the routes (which know their path), not in `app/layout.tsx`. The
complete file is in
[cmssy-next-starter](https://github.com/cmssy-io/cmssy-next-starter/blob/main/cmssy/layout-slot.tsx).

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

SEO is the app's, not the SDK's: metadata, `app/sitemap.ts` and `app/robots.ts`
are queries plus transformation, and both are things your app already does. The
SDK gives you the gateway and stops:

```ts
// services/seo.ts
const data = await graphqlRequest(
  cmssy,
  PAGE_META_QUERY,
  { workspaceSlug: cmssy.workspaceSlug, slug },
  { public: true, retry: {} },
);
```

Three things are easy to get wrong and worth copying from the starter's
[`services/seo.ts`](https://github.com/cmssy-io/cmssy-next-starter/blob/main/services/seo.ts)
and [`app/sitemap.ts`](https://github.com/cmssy-io/cmssy-next-starter/blob/main/app/sitemap.ts):

- **Localized fields.** `seoTitle` comes back language-keyed once a workspace has
  more than one language. Rendering it raw prints `[object Object]`.
- **One `<url>` per language**, each listing all of them plus `x-default`. Listing
  only the default language and hanging the translations off it as alternates
  leaves the translated URLs out of the sitemap entirely.
- **The 404 page is a published page.** Exclude it by `siteConfig.notFoundPageId`,
  and drop drafts (`page.list` returns them too).

Rendering products or categories from model records? They are not pages, so query
the model and append their URLs with the same `baseUrl` and locales.

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
