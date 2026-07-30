# Migrating to v10

v10 slims the SDK from ~110 public symbols to ~22. The rule behind every removal:

> **Anything expressible as a GraphQL query is your app's query, not an SDK
> helper.** The SDK keeps the gateway, the editor/preview wiring, and block
> authoring. It no longer mirrors the graph.

Nothing about your blocks, your config or your editor wiring changes. What
changes is that reads you used to get for free are now a query you own - typed
against the schema, in your repo, where you can change them.

**There is no codemod for this major**, unlike v5, v7, v8 and v9. Those rewrote
import paths, which a tool can do mechanically. This one trades helpers for
queries only you can write: a codemod could delete the `buildCmssyMetadata` call
but not decide which fields your `generateMetadata` needs. The table below is the
work, one row at a time.

## What was removed, and what replaces it

| Removed (v9)                                                                                        | Replacement                                                        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `buildCmssyMetadata`                                                                                | Your `generateMetadata` - query `public.page.get`                  |
| `createCmssySitemap`, `createCmssyRobots`                                                           | Your `app/sitemap.ts` / `app/robots.ts` - query `public.page.list` |
| `createCmssyNotFound`                                                                               | Your `app/not-found.tsx`                                           |
| `CmssyLayoutSlot`                                                                                   | Your layout slot - see [wiring §5](../wiring.md)                   |
| `CmssyLink` (`@cmssy/next/client`)                                                                  | `next/link` + `localizeHref(href, locale)`                         |
| `getCmssyLocale`                                                                                    | The routed path (static-safe) or `CMSSY_LOCALE_HEADER`             |
| `createCmssyAuthRoute`, `getCmssyUser`, session helpers, `config.auth`                              | Your own session; the delivery API's member mutations              |
| `createCmssyCartRoute`, `createCmssyOrdersRoute`, `fetchProducts`, the product/cart/checkout blocks | Your Server Actions over the cart/order mutations                  |
| `CmssyAuthProvider` / `useCmssyUser`, `CmssyCommerceProvider` / `useCart`, `useCmssyOrders`         | Your own providers                                                 |
| `fetchPage`, `fetchPages`, `fetchPageMeta`, `fetchLayouts`, `fetchSiteConfig`, `resolveSiteLocales` | `graphqlRequest` / `createCmssyClient` with your query             |
| `createCmssyLocaleMiddleware`                                                                       | `createCmssyProxy` (it already resolves the language)              |

`@cmssy/core/internal` and `@cmssy/react/internal` exist and export much of the
above - they are for the first-party adapters and change without a major
version. Reaching into them is a way to keep building today and break on a minor
tomorrow. The one exception, `resolveEditorLayoutBlockData`, is documented
because the removal of `CmssyLayoutSlot` left no public alternative.

## The three things that break silently

Copying an SDK helper's behaviour is easy; these three details are what the
helpers quietly got right.

**1. Localized fields.** `seoTitle`, `displayName` and any translatable field
come back language-keyed (`{ en: "…", no: "…" }`) once a workspace has more than
one language. Render one raw and you print `[object Object]`. Pick the active
language, then the default, then anything.

**2. The language prefix is the page's identity.** Pass the catch-all segments to
your metadata builder **as routed**. Strip the prefix first and every translation
gets the default language's title and a canonical pointing at the default
language's URL - which tells Google the translation is a duplicate.

**3. A sitemap lists every language version.** One `<url>` per language, each
listing all of them plus `x-default`. Listing only the default language and
hanging the translations off it as alternates leaves the translated URLs out of
the sitemap entirely - a hint, not a submission. Also drop drafts and the
workspace's 404 page (`siteConfig.notFoundPageId`): `page.list` returns both.

Working versions of all three are in the simple-blog example:
[`services/seo.ts`](https://github.com/cmssy-io/examples/blob/main/simple-blog/services/seo.ts),
[`app/sitemap.ts`](https://github.com/cmssy-io/examples/blob/main/simple-blog/app/sitemap.ts),
[`lib/locale-path.ts`](https://github.com/cmssy-io/examples/blob/main/simple-blog/lib/locale-path.ts).

## Suggested shape for the code you now own

Don't scatter `graphqlRequest` calls through your routes. One document per
operation, one gateway, one service per concern:

```
graphql/query/*.graphql   one file per operation
graphql/generated/        graphql-codegen (client preset), committed
services/gateway.ts       publicRequest(document, variables, label)
services/site.ts …        what the app actually asks for
```

With `graphql-codegen` the generated document types the variables **and** the
result, so a field the API does not have is a build error rather than a runtime
`undefined`. Since 10.6 `query` / `queryScoped` take those documents directly -
same two methods, no new API:

```ts
const client = createCmssyClient(cmssy);

const data = await client.query(PublicPageMetaDocument, {
  workspaceSlug: cmssy.workspaceSlug,
  slug,
});
```

A `TypedDocumentNode`, a `TypedDocumentString` or a string all work, so the
codegen mode is yours to pick and `graphql` stays a dev dependency.
`queryScoped` injects the workspace id. When you need per-call options -
`{ public: true, retry: {} }` for an unauthenticated read, an `authorization`
header for a member read - wrap it once:

```ts
export function publicRequest<Result, Variables>(
  document: CmssyTypedDocument<Result, Variables>,
  variables: Variables,
): Promise<Result> {
  // reads only: the gateway also carries mutations, so retry stays opt-in
  return client.query(document, variables, { public: true, retry: {} });
}
```

## 10.3: one context channel

`CmssyServerPage`, `CmssyServerLayout`, `CmssyEditablePage`,
`resolveEditorBlockData` and `createCmssyPage` take `appContext`: whatever your
app hands the renderer reaches every block as `context.app`, untouched. It
replaces the typed field per requirement that block context was growing (auth,
workspace, page).

`blockPageOf` is gone - `buildBlockContext` takes the fetched page directly.

Prefer the function form on `createCmssyPage`; it is called per request with
`{ page, locale, path }`, and a value fixed at module scope cannot vary by
visitor.

## Checklist

1. `pnpm up @cmssy/core @cmssy/react @cmssy/next --latest`
2. Build. Every removed symbol is now an unresolved import - that list is your
   migration.
3. Move each one into `graphql/` + `services/` (or copy the example's).
4. Re-check the three silent breaks above, especially on a multi-language
   workspace.
5. `checkCmssyEditMode({ baseUrl, secret })` - a build proves the site compiles,
   not that it can still be edited. See [testing](../testing.md).
