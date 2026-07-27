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

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage, CmssyLayoutSlot } from "@cmssy/next/server";
import { publishedPaths } from "@/services/pages";

export const revalidate = 3600;
export const dynamicParams = true;

// Without this the route is served on demand every request and the
// `revalidate` above does nothing at all - see the note below.
export function generateStaticParams() {
  return publishedPaths();
}

export default async function Page(props) {
  const { path } = await props.params;
  const slot = (position) => (
    <CmssyLayoutSlot
      config={cmssy}
      blocks={blocks}
      position={position}
      path={path ?? []}      // the language prefix in it IS the language
      editMode={false}       // true only on the /cmssy-edit route
      editable={EditableLayout}
    />
  );
  return (
    <>
      {slot("header")}
      <main><CmssyPage {...props} /></main>
      {slot("footer")}
    </>
  );
}
```

Three things this gets right that every hand-written version got at least one of
wrong between 10.0 and 10.9 - which is why it exists again:

1. **In edit mode it fetches with the preview secret.** Otherwise you edit the
   draft header and the editor shows you the published one.
2. **The language comes from `path`**, not from `headers()`. A caller with no
   params passes `locale` instead; there is no header fallback, because a
   cached route never sees the header the proxy set and would render the wrong
   language while looking like it worked.
3. **The editor gets `resolvedContent`**, not just loader data. The canvas
   renders stored content, and a relation field there is raw ids.

`editable` is required, and a component rather than a loader: the registry is
imported lazily on the client, and a function cannot cross the server boundary.
Making it optional is what leaves an editor that can select the header and not
fill it, so the type says no.

`editMode` is required for the same reason. It is a parameter rather than a
lookup because every way of asking the request - `headers()`, `draftMode()` - is
a dynamic API, and one read makes the whole route uncacheable. The route segment
already knows: the public route passes `false`, `/cmssy-edit` passes `true`.

### Why `generateStaticParams` is not optional

A catch-all route that generates no params is rendered on demand on every
request. `export const revalidate` is then ignored - the build prints a blank
Revalidate column and the responses carry
`Cache-Control: private, no-cache, no-store`. That is not a slow site; it is a
site with no cache at all, and every visit costs a delivery API call.

Check it, on a production build rather than `next dev`, which renders everything
dynamically:

```bash
pnpm build && pnpm start
curl -sI http://localhost:3000/ | grep -i 'cache-control\|x-nextjs-prerender'
# x-nextjs-prerender: 1
# Cache-Control: s-maxage=3600, stale-while-revalidate=31532400
```

`dynamicParams = true` keeps pages published after the build working: the first
request renders them and they are cached from then on.

Mount it per route, not in `app/layout.tsx`: a route knows its path. There are
six positions - `top`, `header`, `sidebar_left`, `sidebar_right`, `footer`,
`bottom` - and `LayoutPosition` / `layoutPositionValues` name them.

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
