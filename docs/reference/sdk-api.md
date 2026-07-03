---
title: API reference
description: Every public export of @cmssy/react and @cmssy/next - block authoring, the delivery client, page/SEO/draft helpers, auth, locale, commerce - with signatures.
---

# API reference

The public surface of the two SDK packages, grouped by use. Signatures match the
source; if something here disagrees with the installed package, the package wins.

## @cmssy/react

The core: block authoring, the delivery client, and the server renderers.

### Block authoring

| Export            | Signature                                 | Notes                                                                                                                                            |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defineBlock`     | `(definition) => BlockDefinition`         | Declares a block; optional async `loader`. Optional `description` (one-line) is surfaced to the AI page composer to guide block selection/order. |
| `fields`          | object of field builders                  | `singleLine`, `multiLine`, `richText`, `numeric`, `date`, `media`, `link`, `select`, `multiselect`, `boolean`, `color`, `repeater`.              |
| `buildBlockMap`   | `(blocks: BlockDefinition[]) => BlockMap` | Maps `type` to component for rendering.                                                                                                          |
| `blocksToSchemas` | `(blocks) => BlockSchema[]`               | Editor schema metadata.                                                                                                                          |
| `blocksToMeta`    | `(blocks) => BlockMeta[]`                 | Editor block-picker metadata.                                                                                                                    |

See [Authoring a block](../building-blocks/authoring-blocks.md). There is **no**
rich-text renderer or sanitizer - see the [rich-text recipe](../building-blocks/recipes.md).

### Delivery client

```ts
createCmssyClient(config: CmssyClientConfig): CmssyClient;
```

`CmssyClientConfig` is `{ apiUrl?: string; workspaceSlug: string }` - `apiUrl`
[defaults to cmssy cloud](./delivery-api.md). The client has exactly three members:

```ts
interface CmssyClient {
  readonly config: CmssyClientConfig;
  query<T>(document, variables?, options?): Promise<T>;
  queryScoped<T>(document, variables?, options?): Promise<T>; // auto-injects workspaceId
  resolveWorkspaceId(options?): Promise<string>;
}
```

There is **no** `client.graphqlRequest()` and **no** `client.form()`. For a raw
request without a client, use the standalone `graphqlRequest`:

```ts
graphqlRequest<T>(config, query, variables, options?, label?): Promise<T>;
```

| Export               | Signature                                                           |
| -------------------- | ------------------------------------------------------------------- |
| `createCmssyClient`  | `(config) => CmssyClient`                                           |
| `graphqlRequest`     | `(config, query, variables, options?, label?) => Promise<T>`        |
| `fetchPage`          | `(config, path, options?) => Promise<CmssyPageData \| null>`        |
| `fetchPageById`      | `(config, pageId, options?) => Promise<CmssyPageData \| null>`      |
| `fetchPages`         | `(config, options?) => Promise<CmssyPageSummary[]>`                 |
| `fetchPageMeta`      | `(config, path, options?) => Promise<CmssyPageMeta \| null>`        |
| `fetchLayouts`       | `(config, path, options?) => Promise<CmssyLayoutGroup[]>`           |
| `fetchSiteConfig`    | `(config) => Promise<CmssySiteConfig>`                              |
| `resolveWorkspaceId` | `(config) => Promise<string>`                                       |
| `resolveSiteLocales` | `(config) => Promise<CmssySiteLocales>`                             |
| `collectFormIds`     | `(blocks) => string[]`                                              |
| `resolveForms`       | `(client, formIds) => Promise<Record<string, CmssyFormDefinition>>` |
| `resolveApiUrl`      | `(apiUrl?) => string`                                               |
| `normalizeSlug`      | `(path) => string`                                                  |

Exported query/mutation constants (use with `query` / `queryScoped`):
`SITE_CONFIG_QUERY`, `MODEL_DEFINITIONS_QUERY`, `MODEL_RECORDS_QUERY`,
`FORM_QUERY`, `SUBMIT_FORM_MUTATION`. Plus `DEFAULT_CMSSY_API_URL`. See the
[Delivery API](./delivery-api.md) for what each returns.

### Server renderers & block context

| Export                       | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| `CmssyServerPage`            | Renders a page's blocks server-side.             |
| `CmssyServerLayout`          | Renders layout-position blocks (header/footer).  |
| `CmssyBlock`                 | Renders a single block instance.                 |
| `buildBlockContext`          | Builds the `CmssyBlockContext` passed to blocks. |
| `getBlockContentForLanguage` | Resolves a block's content for a locale.         |

Types: `CmssyBlockContext`, `CmssyLocaleContext`, `CmssyBlockAuthContext`,
`CmssyBlockMember`, `CmssyBlockWorkspace`, `CmssyClientConfig`, `RawBlock`,
`CmssyPageData`, `CmssyPageSummary`, `CmssyPageMeta`, `CmssyLayoutGroup`,
`CmssyFormDefinition`, `CmssyFormField`, `CmssyFormSettings`,
`CmssyFormSubmitResponse`, `CmssySiteConfig`, `CmssyModelDefinition`,
`CmssyModelRecord`, `CmssyProduct`, `CmssyOrder`, and more.

### `@cmssy/react/client`

Client-only helpers for the editor bridge and providers: `CmssyLazyEditor`,
`CmssyLazyLayout`, `CmssyLocaleProvider` / `useCmssyLocale`, `useEditBridge`,
`CmssyAuthProvider` / `useCmssyUser`, `CmssyCommerceProvider` / `useCart`,
`useCmssyOrders`, and currency helpers (`formatPrice`, `toMinorUnits`,
`fromMinorUnits`, `fractionDigits`).

## @cmssy/next

The Next.js App Router adapter: page route, SEO, draft mode, auth, locale, CSP.

### Pages, SEO & draft

| Export                | Signature                                           | Use in                     |
| --------------------- | --------------------------------------------------- | -------------------------- |
| `createCmssyPage`     | `(config, blocks, options?) => PageComponent`       | `app/[[...path]]/page.tsx` |
| `createCmssyNotFound` | `(config, options?) => NotFoundComponent`           | `app/not-found.tsx`        |
| `buildCmssyMetadata`  | `(config, path?, options?) => Promise<Metadata>`    | `generateMetadata`         |
| `createCmssyRobots`   | `(config, options?) => () => MetadataRoute.Robots`  | `app/robots.ts`            |
| `createCmssySitemap`  | `(config, options?) => () => MetadataRoute.Sitemap` | `app/sitemap.ts`           |
| `createDraftRoute`    | `(config) => (request) => Promise<Response>`        | `app/api/draft/route.ts`   |

### Edit mode & CSP

| Export                | Signature                                                         |
| --------------------- | ----------------------------------------------------------------- |
| `isCmssyEditMode`     | `() => Promise<boolean>` (server component)                       |
| `isCmssyEditRequest`  | `(request) => boolean` (middleware)                               |
| `CMSSY_EDIT_HEADER`   | `"x-cmssy-edit"`                                                  |
| `applyCmssyCsp`       | `(response, options?) => response` - sets `frame-ancestors`       |
| `cmssyCspHeaders`     | `(options?) => Record<string, string>`                            |
| `resolveEditorOrigin` | `(editorOrigin?) => string \| string[]` - defaults to cmssy admin |

`CmssyCspOptions.editorOrigin` is optional; it
[defaults](./delivery-api.md) to `https://www.cmssy.io`.

### Locale

`getCmssyLocale(config)`, `createCmssyLocaleMiddleware(config)`,
`localeForPathname(config, pathname)`, `splitCmssyLocale(config, path?)`,
`resolveLocaleFromPathname(config, pathname)`, and the `CMSSY_LOCALE_HEADER`
(`"x-cmssy-locale"`) constant.

### Member auth

| Export                      | Signature                                          |
| --------------------------- | -------------------------------------------------- |
| `createCmssyAuthRoute`      | `(config) => { POST, GET }`                        |
| `createCmssyAuthMiddleware` | `(config) => (request) => Promise<NextResponse>`   |
| `getCmssyUser`              | `(config) => Promise<{ recordId, email } \| null>` |
| `getCmssyAccessToken`       | `(config) => Promise<string \| null>`              |
| `assertAuthConfig`          | `(config) => CmssyAuthConfig` (throws if unset)    |

See [Member auth](../auth/member-auth.md). Session internals
(`CMSSY_SESSION_COOKIE`, `sealSession`, `openSession`, …) are also exported for
advanced use.

### Commerce & webhooks

`fetchProducts(config, { modelSlug, filter?, limit? })`,
`fetchProduct(config, { modelSlug, slug, slugField? })`,
`createCmssyCartRoute(config)`, `createCmssyOrdersRoute(config)`,
`verifyCmssyWebhook(event, options?)` / `CmssyWebhookError`.

### `@cmssy/next/client`

`CmssyLink` - locale-aware internal navigation (wraps `next/link`).

## Config types

```ts
interface CmssyNextConfig {
  workspaceSlug: string;
  draftSecret: string; // generated per workspace: Settings → Headless (copy exact value)
  apiUrl?: string; // default https://api.cmssy.io/graphql
  editorOrigin?: string | string[]; // default https://www.cmssy.io
  devToken?: string; // cs_… API token; opts into editor-controlled dev preview (development only)
  siteUrl?: string;
  auth?: { modelSlug: string; sessionSecret: string };
  defaultLocale?: string;
  enabledLocales?: string[];
  resolveLocale?: () => string | Promise<string>;
}
```
