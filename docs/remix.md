# cmssy on React Router 7 (Remix)

`@cmssy/remix` depends on `@cmssy/core` and `@cmssy/react`. It never touches Next
- a test in the package fails the build if it does.

## Wiring

```ts
// cmssy.config.ts
import { defineCmssyConfig } from "@cmssy/remix";

export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
});
```

```tsx
// app/routes/page.tsx
export const loader = createCmssyLoader(cmssy);

// Without this the admin cannot frame your site, and the editor is an empty box
// with no error anywhere.
export const headers = createCmssyHeaders(cmssy);

export default function CmssyPage({ loaderData }: Route.ComponentProps) {
  const { page, locale, isEdit, editorOrigin } = loaderData;
  if (isEdit) return <CmssyEditor page={page} locale={locale} edit={{ editorOrigin }} />;
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

## SEO

```ts
// app/routes/sitemap.ts
export const loader = createCmssySitemap(cmssy);
```

One `<url>` per language: a translated page is not a duplicate.

## Prove the editor works

```ts
import { checkCmssyEditMode } from "@cmssy/remix/testing";
```

Same check, same protocol, third framework.
