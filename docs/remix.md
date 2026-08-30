# cmssy on React Router 7 (Remix)

`@cmssy/remix` depends on `@cmssy/core` and `@cmssy/react`. It never touches Next

- a test in the package fails the build if it does.

## Wiring

```ts
// cmssy.config.ts
import { defineCmssyConfig, defineCmssyLayout } from "@cmssy/remix";

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

`layout` names the regions a layout block can live in; the editor shows exactly
these, and `CmssyRegion<typeof layout>` is the union of their ids for your slot
component. See [wiring §1](wiring.md#1-config).

```tsx
// app/routes/page.tsx
export const loader = createCmssyLoader(cmssy);

// Without this the admin cannot frame your site, and the editor is an empty box
// with no error anywhere.
export const headers = createCmssyHeaders(cmssy);

export default function CmssyPage({ loaderData }: Route.ComponentProps) {
  const { page, locale, isEdit, editorOrigin } = loaderData;
  if (isEdit)
    return <CmssyEditor page={page} locale={locale} edit={{ editorOrigin }} />;
  return <Blocks page={page} locale={locale} />;
}
```

## Why there is no `/cmssy-edit` route here

The Next adapter needs one because a Next page can be **static**, and a static
page never sees the query string that would put it in edit mode. React Router
renders on every request, so the editor is served from the page itself - verified
exactly the same way (`cmssyEdit=1` **and** a matching `cmssySecret`, CMS-948),
on the same protocol, with less machinery.

The framework decides how much machinery the same idea costs. That is what an
adapter is for.

## The header and footer

They are layout **blocks**, not markup you own, and they have to reach the
editor filled in. `loadCmssyPage` does the work; you pass it your block
registry:

```ts
export const loader = createCmssyLoader(cmssy, { blocks });
```

The loader data carries `layoutRegions` - your declaration - so the route can
pass it to `CmssyEditor` as `edit={{ editorOrigin, layoutRegions }}`; that is
how the editor learns which regions this site has.

`editorData` is keyed by position, because the header and the footer hold
different blocks and resolve to different data. Hand it to the slot:

```tsx
<LayoutSlot
  groups={layouts}
  position="header"
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

A route costs several delivery calls: the site locales, the layouts, the page.
Ask for enough of them at once and the delivery API answers `429` with a
`Retry-After`.

The loader runs while a visitor holds the connection open, so it defaults to the
**`interactive`** mode: 2 retries, nothing above a 1s `Retry-After`, 2s of
waiting in total. A `Retry-After: 45` is not waited out - you get the error, and
you get it in seconds rather than a minute. That is the right trade here; it is
the wrong one in a build, which is why the Next adapter picks its mode from the
build phase instead.

If you prerender routes with React Router 7, say so:

```ts
export const loader = createCmssyLoader(cmssy, { blocks, retry: "build" });
```

Or hand it a policy of your own:

```ts
export const loader = createCmssyLoader(cmssy, {
  blocks,
  retry: { maxRetries: 5, maxRetryAfterMs: 120_000 },
});
```

`retry: false` fails on the first 429. The policy covers every delivery call the
loader makes, the layout slot included.

Budget for it: `maxTotalWaitMs` bounds how long a **single** call sleeps in
total, and the requests themselves land on top. Keep the sum under whatever
timeout sits in front of the route.

## SEO

The adapter ships no sitemap or robots helper (10.0 removed them): both are a
query plus a transformation, so they are your app's.

```ts
// app/routes/sitemap.ts
export const loader = async () => {
  const data = await graphqlRequest(
    cmssy,
    PAGES_QUERY,
    { workspaceSlug: cmssy.workspaceSlug },
    { public: true, retry: {} },
  );
  // …one <url> per language version, drafts and the 404 page filtered out
};
```

One `<url>` per language: a translated page is not a duplicate. The
[simple-blog example](https://github.com/cmssy-io/examples/blob/main/simple-blog/app/sitemap.ts)
has the full logic, framework aside.

## Prove the editor works

```ts
import { checkCmssyEditMode } from "@cmssy/remix/testing";
```

Same check, same protocol, third framework.
