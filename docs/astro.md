# cmssy on Astro

`@cmssy/astro` exists to make one claim checkable: **cmssy is headless for any
frontend, not for Next.**

It depends on `@cmssy/core` and nothing else. A test in the package fails the
build if a single file imports React or Next.

## Wiring

```ts
// src/cmssy.config.ts
import { defineCmssyConfig, defineCmssyLayout } from "@cmssy/astro";

export const layout = defineCmssyLayout({
  regions: [
    { id: "header", label: "Header" },
    { id: "footer", label: "Footer" },
  ],
});

export const cmssy = defineCmssyConfig({
  org: import.meta.env.CMSSY_ORG_SLUG,
  workspaceSlug: import.meta.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: import.meta.env.CMSSY_DRAFT_SECRET,
  layout,
});
```

`layout` names the regions a layout block can live in; the editor shows exactly
these, and `CmssyRegion<typeof layout>` is the union of their ids for your slot
component. See [wiring §1](wiring.md#1-config).

```ts
// src/middleware.ts
import { cmssyMiddleware } from "@cmssy/astro";
import { cmssy } from "./cmssy.config";

export const onRequest = cmssyMiddleware(cmssy);
```

That is the adapter. It resolves the language, routes a **verified** editor
request to `/cmssy-edit/...`, and applies the CSP that lets the admin frame your
site - in that order, because the order is what makes it correct.

### Language prefixes

A catch-all route (`[...path].astro`) reads the language off the path itself and
needs nothing more. A site built from static routes - `src/pages/shop.astro` -
has no route for `/no/shop`, so ask for the prefix to come off before routing:

```ts
export const onRequest = cmssyMiddleware(cmssy, { stripLocalePrefix: true });
```

The language still reaches the page: `loadCmssyPage` reads it from the header
the middleware set. Only a non-default language is prefixed, and which language
needs no prefix comes from the workspace rather than a guess.

Not supported: a site with `base` set. The prefix is looked for in the full
pathname, so under a base it is never found.

## The pages

```astro
---
// src/pages/[...path].astro
import { loadCmssyPage } from "@cmssy/astro";
import { cmssy } from "../cmssy.config";
import Blocks from "../components/Blocks.astro";

const { page, locale } = await loadCmssyPage(cmssy, Astro.request, Astro.url);
if (!page) return Astro.redirect("/404");
---
<Blocks blocks={page.blocks} locale={locale} />
```

```astro
---
// src/pages/cmssy-edit/[...path].astro  ← the editor lands here
export const prerender = false;
import { loadCmssyPage } from "@cmssy/astro";
import { cmssy } from "../../cmssy.config";
import Editor from "../../components/Editor";   // a React island

const { page, locale } = await loadCmssyPage(cmssy, Astro.request, Astro.url);
---
<Editor client:load page={page} locale={locale} />
```

**Skip the edit route and the editor preview is blank.** It is the single most
common way to break a cmssy app, on any framework.

## The header and footer

They are layout **blocks**, not markup you own, and they have to reach the
editor filled in. `loadCmssyPage` does the work; you pass it your block
registry:

```ts
const {
  layouts,
  pageContext,
  locale,
  defaultLocale,
  enabledLocales,
  editorData,
  layoutRegions,
} = await loadCmssyPage(cmssy, Astro.request, Astro.url, { blocks });
```

`layoutRegions` is your declaration, handed back so the edit page can pass it
to `CmssyEditor` as `edit={{ editorOrigin, layoutRegions }}` - that is how the
editor learns which regions this site has.

`editorData` is keyed by region, because the header and the footer hold
different blocks and resolve to different data. Hand it to the slot:

```tsx
<LayoutSlot
  groups={layouts}
  region="header"
  page={pageContext}
  locale={locale}
  defaultLocale={defaultLocale}
  enabledLocales={enabledLocales}
  edit={isEdit ? { editorOrigin } : undefined}
  data={editorData?.header?.data}
  resolvedContent={editorData?.header?.resolvedContent}
/>
```

Skip `resolvedContent` and the canvas shows a relation field as the raw ids it
stores: the published site looks right, and the editor cannot fill the header.
That was this adapter's behaviour before 11.1.0.

`pageContext` is the routed page as the layout blocks were given it -
`{ slug, path }` - and the scaffolded slot passes it on as `page`, so every
layout block sees it as `context.page` in both modes. Its `settings` live on
the matching group in `layouts`; `resolveCmssyLayout` (re-exported here) returns
`{ groups, settings, page, element }` for a route that wants the slot as one call.

The data half - preview secret in edit mode, language, editor data - is
`resolveCmssyLayoutSlot` in `@cmssy/react`, the same function the Next adapter
uses. Three renderers, one set of rules.

## Rate limits and retry

A page costs several delivery calls: the site locales, the layouts, the page.
Pre-render enough of them at once and the delivery API answers `429` with a
`Retry-After`.

A prerendered page and an on-demand one want opposite things from that 429. The
build should wait it out - a page 45s late is cheaper than a failed deploy. A
visitor should not be parked for 45s to maybe avoid an error page. Tell the
adapter which one it is with the flag Astro already gives you:

```astro
const { page, locale } = await loadCmssyPage(cmssy, Astro.request, Astro.url, {
  blocks,
  prerendered: Astro.isPrerendered,
});
```

That picks the `build` mode (4 retries, honour `Retry-After` up to 60s, 180s of
waiting in total) or `interactive` (2 retries, nothing above 1s, 2s in total).
Omit `prerendered` and you get `build`, matching Astro's own default output.

Override it per call when you know better:

```ts
retry: { maxRetries: 5, maxRetryAfterMs: 120_000 }   // or "build" / "interactive" / false
```

`retry: false` fails on the first 429. The policy covers every delivery call the
loader makes, the layout slot included.

Budget for it: `maxTotalWaitMs` bounds how long a **single** call sleeps in
total, and the requests themselves land on top. A static build's per-page
timeout has to sit above that sum.

## SEO

The adapter ships no sitemap or robots helper (10.0 removed them): both are a
query plus a transformation, so they are your app's. Query `public.page.list`
through the gateway and emit the XML from an endpoint:

```ts
// src/pages/sitemap.xml.ts
import { graphqlRequest } from "@cmssy/core";
import { cmssy } from "../cmssy.config";

export const GET = async () => {
  const data = await graphqlRequest(
    cmssy,
    PAGES_QUERY,
    { workspaceSlug: cmssy.workspaceSlug },
    { public: true, retry: {} },
  );
  // …one <url> per language version, drafts and the 404 page filtered out
};
```

One `<url>` per language: a translated page is not a duplicate, and telling
Google it is keeps the translation out of the index. The
[simple-blog example](https://github.com/cmssy-io/examples/blob/main/simple-blog/app/sitemap.ts)
has the full logic, framework aside.

## Rendering blocks

Astro renders whatever you like. Two honest options:

- **`.astro` components** - fastest, zero client JS, and the public site never
  ships a framework.
- **React islands** (`@astrojs/react` + your `@cmssy/react` blocks) - reuse the
  block components you already have. The **edit bridge is a React island** either
  way, because the editor talks over `postMessage` to a client component.

The protocol is in `@cmssy/core`, so a Vue bridge would speak it too. That is the
whole point of the layering.

## Prove the editor works

```ts
import { checkCmssyEditMode } from "@cmssy/astro/testing";

const result = await checkCmssyEditMode({ baseUrl, secret });
expect(result.failures).toEqual([]);
```

Same check, same protocol, different framework - which is the proof.
