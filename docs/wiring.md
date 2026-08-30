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
import { defineCmssyConfig, defineCmssyLayout } from "@cmssy/next";

export const layout = defineCmssyLayout({
  regions: [
    { id: "header", label: "Header" },
    { id: "footer", label: "Footer" },
  ],
});

export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
  layout,
});
```

`layout` is the list of places on your page a layout block can live - a
header, a footer, a sidebar, a cookie bar - and **you** name them. The editor
shows exactly these regions under Layouts, and `CmssyLayoutSlot` accepts
exactly these ids as `position`; `CmssyRegion<typeof layout>` is that union
for your own code. Ids start with a letter or digit and continue with
`[a-z0-9_-]`, at most 50 characters, at most 20 of them. Write the `regions`
array inline (or `as const`): ids coming from a plain variable widen to
`string`. Leave `layout` out and the editor falls back to `header` and
`footer`.

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
import { publishedPaths } from "@/services/pages";
import { buildPageMetadata } from "@/services/seo";

export const revalidate = 3600;
export const dynamicParams = true;

// Not optional: without it this route is served on demand on every request and
// the `revalidate` above does nothing. §5 explains what that costs.
export function generateStaticParams() {
  return publishedPaths();
}

export async function generateMetadata({ params }) {
  const { path } = await params;
  // As routed, prefix and all: the prefix IS the language.
  return buildPageMetadata(path);
}

export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
```

That is the page for a site with no header or footer. Those are layout blocks
rather than markup you own, so a site that has them mounts a slot too - §5 shows
this same file with the slots in place, which is what `cmssy init` writes.

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

### Providers go in one file both roots render

`/cmssy-edit` is a **separate root**, with its own `<html>`. A provider added to
`app/[[...path]]/layout.tsx` is therefore absent from every editor preview, and
the failure is silent: no error, no failed request, just a page missing whatever
that provider gave it. A reveal animation is the loudest case - without its
motion provider, `whileInView` never attaches and every section stays at
`opacity: 0`, so the preview looks blank forever.

Keep one file and render it from both roots:

```tsx
// cmssy/site-providers.tsx
"use client";

import type { ReactNode } from "react";
import { LazyMotion, domAnimation } from "motion/react";

export function SiteProviders({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
```

```tsx
// app/[[...path]]/layout.tsx AND app/cmssy-edit/[[...path]]/layout.tsx
<body>
  <SiteProviders>{children}</SiteProviders>
</body>
```

`cmssy init` scaffolds that file as a passthrough, so the seam exists before you
need it, and wires the rule that guards it: `edit-route-provider-parity` from
`@cmssy/eslint-plugin` fails the build if a provider ever lands in one root and
not the other. `init` adds the plugin to `devDependencies` and either writes an
`eslint.config.mjs` or appends `...cmssy.configs.recommended` to the one you
have - it never overwrites your config, and if it cannot edit it (a legacy
`.eslintrc`, CommonJS, no default export) it prints the two lines to paste. Add
them to an existing setup with:

```js
// eslint.config.mjs
import cmssy from "@cmssy/eslint-plugin";

export default [...yourConfig, ...cmssy.configs.recommended];
```

`configs.recommended` declares no `files` and no parser, so it inherits whatever
your config already lints. In a config that is **only** cmssy rules, use
`configs.standalone` instead - it brings the TypeScript parser and the
`.ts`/`.tsx` patterns with it, because eslint lints neither by default. That is
what `init` writes.

Global CSS and metadata have the same split-root problem and no lint rule -
repeat them in both.

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
      path={path ?? []} // the language prefix in it IS the language
      editMode={false} // true only on the /cmssy-edit route
      editable={EditableLayout}
    />
  );
  return (
    <>
      {slot("header")}
      <main>
        <CmssyPage {...props} />
      </main>
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

**What caching costs you, stated plainly.** With `revalidate = 3600`, an edit
published in the CMS takes up to an hour to appear. And because an unknown path
renders as not-found, a URL someone visited _before_ you published it keeps
serving 404 for the rest of that window - the 404 is cached like any other
response. Both go away when publishing revalidates on demand
(`revalidatePath` from a webhook route); until you wire that, pick `revalidate`
as the staleness you can live with, not the largest number that still looks
fast.

Mount it per route, not in `app/layout.tsx`: a route knows its path. Mount one
slot per region you declared in `cmssy.config.ts` - `position` is typed to
those ids, so a slot for a region you did not declare does not compile, and a
region you declared but never mounted is content the editor can fill and the
site never shows.

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

Three things are easy to get wrong and worth copying from the simple-blog example's
[`services/seo.ts`](https://github.com/cmssy-io/examples/blob/main/simple-blog/services/seo.ts)
and [`app/sitemap.ts`](https://github.com/cmssy-io/examples/blob/main/simple-blog/app/sitemap.ts):

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
  expectLayoutBlocks: true, // your header and footer are cmssy blocks
  localizedPath: "/no", // only if your URLs carry the language
});
expect(result.failures).toEqual([]);
console.log(result.skipped); // what this run did NOT check
```

A build proves the site compiles. It says nothing about whether the site can be
**edited** - and that is the part that breaks silently.

Called with `baseUrl` and `secret` alone, four of its six assertions stand down
and say so in `skipped`. An empty `failures` answers "did anything fail", not
"was anything checked" - print `skipped` in CI. See [testing](testing.md).
