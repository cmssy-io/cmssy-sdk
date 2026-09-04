---
title: API reference
description: Every public export of @cmssy/core, @cmssy/react and @cmssy/next - the gateway, block authoring, the page route and the editor bridge - with signatures.
---

# API reference

The public surface of the SDK, grouped by use. Signatures match the source; if
something here disagrees with the installed package, the package wins.

**What the SDK is, since 10.0.** Three things: a **gateway** to the delivery API,
the **editor/preview wiring**, and **block authoring**. Anything expressible as a
GraphQL query is your app's query, not an SDK helper - so there are no SEO, auth,
commerce, or fetch-wrapper exports. See
[migrating from v9](../migrations/v9-to-v10.md) if you are coming from an older
version, and the
[simple-blog example](https://github.com/cmssy-io/examples/tree/main/simple-blog) for what the app side
of that looks like.

**Where things live.** `@cmssy/core` is the foundation: config, the gateway, the
editor protocol, webhooks - no framework, no Node built-ins. `@cmssy/react`
renders. `@cmssy/next`, `@cmssy/astro` and `@cmssy/remix` are adapters over both.
`@cmssy/react` and `@cmssy/next` re-export the common core symbols, so a simple
app needs one import path.

**`/internal` subpaths are not public API.** `@cmssy/core/internal`,
`@cmssy/react/internal` and `@cmssy/react/internal-server` exist for the
first-party adapters. They ship types and they work, but they change without a
major version - treat them as private. Nothing an app needs lives there: the
editor-data resolvers moved onto `@cmssy/react` in 10.9.0.

## @cmssy/core

### Config

| Export                        | Signature                                       | Notes                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineCmssyConfig`           | `(config: CmssyEnvConfig<L>) => CmssyConfig<L>` | Validates env-sourced values; throws naming every missing one.                                                                                                                                                                                                                          |
| `defineCmssyLayout`           | `({ regions }) => CmssyLayout`                  | Declares the layout regions the site has and, per region, an optional `settings` schema built with `fields.*` (the same `BlockPropsSchema` a block's `props` is); throws on a bad id, a duplicate, more than 20, a label over 100 characters, or settings that are not a schema object. |
| `CmssyConfig`                 | type                                            | The validated config (see [below](#config-types)).                                                                                                                                                                                                                                      |
| `CmssyEnvConfig`              | type                                            | The same with the required fields widened to `\| undefined`.                                                                                                                                                                                                                            |
| `CmssyLayout`                 | type                                            | `{ regions: readonly LayoutRegion[] }`; `LayoutRegion` is `{ id, label?, settings? }`.                                                                                                                                                                                                  |
| `CmssyRegion<L>`              | type                                            | The union of region ids a `CmssyLayout` declares.                                                                                                                                                                                                                                       |
| `CmssyRegionSettingsOf<C, R>` | type                                            | The same from a config: `CmssyRegionSettingsOf<typeof cmssy, "sidebar">`; `Record<string, unknown>` when the config declares no layout. What `CmssyLayoutSlot`'s render prop and `resolveCmssyLayout` type `settings` as.                                                               |
| `CmssyRegionSettings<L, R>`   | type                                            | The values object of region `R`'s `settings` schema, inferred like block content from `props`; `Record<string, never>` for a region without settings.                                                                                                                                   |
| `LayoutRegionId`              | type                                            | `string` - kept as an alias; prefer `CmssyRegion`.                                                                                                                                                                                                                                      |
| `CmssyRegionOf<C>`            | type                                            | The same, read off a `CmssyConfig`; `string` when no layout is declared.                                                                                                                                                                                                                |

```ts
export const layout = defineCmssyLayout({
  regions: [
    { id: "header", label: "Header" },
    {
      id: "sidebar_left",
      label: "Aside",
      settings: {
        showOnMobile: fields.boolean({ label: "Show on mobile" }),
        width: fields.number({ label: "Width (px)", required: true }),
      },
    },
  ],
});

type AsideSettings = CmssyRegionSettings<typeof layout, "sidebar_left">;
// { showOnMobile?: boolean; width: number }
```

The editor renders a form from each region's `settings` schema on the Layouts
page and stores the values as JSON; `fetchLayouts` delivers them as
`settings` on the matching `CmssyLayoutGroup` (`null` when nothing was
authored). A region without `settings` has no settings section.

### Gateway

```ts
createCmssyClient(config: CmssyClientConfig): CmssyClient;
graphqlRequest<T>(config, query, variables, options?, label?): Promise<T>;
```

**Pass a typed document.** `query` / `queryScoped` still take a query string,
but hand them a document that carries its types - what graphql-codegen emits, in
either mode - and the variables are checked and the result inferred, with no
generic to repeat, no `print()`, no cast:

```ts
const data = await client.query(PublicPageMetaDocument, {
  workspaceSlug: cmssy.workspaceSlug,
  slug,
});
data.public.page.get?.seoTitle; // typed; a wrong variable name is a build error

await client.queryScoped(PublicModelRecordsDocument, { modelSlug: "product" });
```

A `TypedDocumentNode` (AST), a `TypedDocumentString` and a plain string all
work, so an app never needs `graphql` at runtime just to print a document it
already generated.

`CmssyClientConfig` is `{ apiUrl?: string; org: string; workspaceSlug: string }` -
`apiUrl` [defaults to cmssy cloud](./delivery-api.md); `org` + `workspaceSlug`
form the org-scoped delivery path `{apiBase}/public/{org}/{workspaceSlug}/graphql`,
where `apiBase` is `apiUrl` with its trailing `/graphql` stripped (default
`https://api.cmssy.io`). A workspace slug only needs to be unique within its
organization. The client has exactly three members (`query` and `queryScoped` each with a typed and a string form):

```ts
interface CmssyClient {
  readonly config: CmssyClientConfig;
  // Typed document: variables checked, result inferred.
  query<R, V>(
    document: CmssyTypedDocument<R, V>,
    variables: V,
    options?,
  ): Promise<R>;
  queryScoped<R, V>(
    document,
    variables: Omit<V, "workspaceId">,
    options?,
  ): Promise<R>;
  // Query string: your own generic, as before.
  query<T>(document: string, variables?, options?): Promise<T>;
  queryScoped<T>(document: string, variables?, options?): Promise<T>;
  resolveWorkspaceId(options?): Promise<string>;
}
```

`GraphqlRequestOptions`:

| Option    | Meaning                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `public`  | Route through the org-scoped public delivery path. Set it for unauthenticated reads.                                                  |
| `retry`   | Retry 429/503, honoring `Retry-After`. **Off by default** - this function also carries mutations. Read-only callers opt in with `{}`. |
| `headers` | Extra request headers (e.g. an `authorization` bearer for a signed-in member).                                                        |
| `fetch`   | Custom fetch. `signal` for cancellation.                                                                                              |

Errors are `CmssyRequestError`. `DEFAULT_CMSSY_API_URL` is exported for a
self-hosted endpoint check. `CMSSY_RATE_LIMIT_WINDOW_MS` (60_000) is the window
the delivery API rate-limits on, and the default `maxRetryAfterMs`: a
`Retry-After` inside that window is waited out, anything longer fails at once.

There is no `fetchPage` / `fetchPages` / `fetchSiteConfig` in the public surface:
write the query. The example's
[`services/`](https://github.com/cmssy-io/examples/tree/main/simple-blog/services)
folder is a working example, `codegen` included.

### Blocks & fields

| Export                         | Signature                    | Notes                                                             |
| ------------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| `fields`                       | object of field builders     | See the list below.                                               |
| `FieldDefinition` `TypedField` | types                        | What a builder returns.                                           |
| `InferBlockContent`            | type                         | Schema → the `content` object a component receives.               |
| `evaluateFieldConditionGroup`  | `(group, values) => boolean` | Conditional-field (`showWhen`) evaluation, for a custom renderer. |
| `buildBlockManifest`           | `(blocks, { category?, regions? }) => BlockManifest` | The manifest `cmssy sync-manifest` pushes: blocks folded with their meta, sorted by type, plus the bridge-shaped regions. |
| `blocksToSchemas` `blocksToMeta` `layoutRegionsToBridge` `propsToSchema` | functions | The serializers the `cmssy:ready` handshake sends with; `@cmssy/react`'s registry re-exports them. |
| `registryToManifestBlocks`     | `(schemas, blockMeta) => BlockManifestBlock[]` | The fold from handshake shape to stored manifest shape. |
| `BlockManifest` `BlockManifestBlock` `BlockManifestSource` | types | What `buildBlockManifest` takes and returns. |

`fields.` builders: `text`, `textarea`, `richText`, `markdown`, `number`, `date`,
`datetime`, `boolean`, `color`, `link`, `url`, `email`, `table`, `json`, `form`,
`pageSelector`, `select`, `radio`, `multiselect`, `media`, `repeater`, `relation`.

### Editor protocol, edit mode & CSP

| Export                                                                  | Signature                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `PROTOCOL_VERSION` / `isProtocolCompatible`                             | `number` / `(version) => boolean`                                 |
| `parseEditorMessage`                                                    | `(data, origin, expectedOrigin) => EditorToAppMessage \| null`    |
| `postToEditor`                                                          | `(target, editorOrigin, message) => void`                         |
| `applyCmssyCsp`                                                         | `(response, options?) => response` - sets `frame-ancestors`       |
| `resolveEditorOrigin`                                                   | `(editorOrigin?) => string \| string[]` - defaults to cmssy admin |
| `DEFAULT_CMSSY_EDITOR_ORIGINS`                                          | `string[]`                                                        |
| `isVerifiedEditUrl`                                                     | `(url, config) => Promise<boolean>`                               |
| `CMSSY_EDIT_HEADER` `CMSSY_EDIT_QUERY_PARAM` `CMSSY_SECRET_QUERY_PARAM` | constants                                                         |

Message types: `AppToEditorMessage`, `EditorToAppMessage`, `ReadyMessage`,
`SelectMessage`, `PatchMessage`, `ClickMessage`, `BoundsMessage`,
`ParentReadyMessage`.

### Locale

`localizeHref(href, locale)` prefixes an internal href with the active language;
`CMSSY_LOCALE_HEADER` (`"x-cmssy-locale"`) is the header the middleware sets. The
language **set** lives in the workspace site config - query it (see
[Delivery API](./delivery-api.md)).

`resolveCmssyLocale(config, path)` answers the language a route's path segments
ask for, for `<html lang>` in a root layout. It takes the segments rather than a
request on purpose: a root layout that reads a header opts every page out of
static rendering. It returns `undefined` when the workspace's languages could
not be read - React then omits the attribute, and no `lang` is honest where a
guessed one is not.

`useCmssyLocale()` (`@cmssy/remix`) is the same answer for React Router, read
off the matched route's loader data - `root.tsx` renders `<html>` and has no
loader of its own. Also `undefined` when nothing resolved a language.

### Webhooks

`await verifyCmssyWebhook({ body, signatureHeader, secret, toleranceSeconds? })`
returns the parsed `CmssyWebhookEvent` and throws `CmssyWebhookError` on any
failure - missing or malformed header, bad signature, stale timestamp, invalid
JSON. It is async: forgetting `await` means the signature is never checked.

`body` must be the **raw** request text (`await req.text()`) - re-serializing
parsed JSON changes bytes and the signature will not match.

`secret` takes one secret or several (`string | readonly string[]`). Several is
for a rotation window: hold the new and the previous secret at once and either
verifies. A non-string is rejected rather than stringified into the key.

Also exported: `VerifyCmssyWebhookOptions`, `CmssyWebhookEvent`,
`CmssyWebhookOrder`. All from `@cmssy/core`. A Next app that only needs the
`content.changed` webhook to expire its cache mounts
`createCmssyRevalidateRoute` from `@cmssy/next/server` instead of calling this
by hand.

### `@cmssy/core/testing` and `/preflight`

`checkCmssyEditMode(options)` proves a deployed site can still be **edited** - see
[testing](../testing.md). It returns `{ ok, failures, skipped }`, and `skipped` is
the half people miss: given `baseUrl` and `secret` alone, four of its six
assertions stand down and are named there. `expectLayoutBlocks`, `localizedPath`
/ `localizedLocale` and `editRoute` are what turn them on.

`/preflight` holds the diagnostics the CLI renders: `collectEditDiagnostics`,
`checkWorkspaceReachable`, `checkDraftSecret`, `checkPreviewUrl`,
`checkFrameAncestors`, `buildEditorUrl`.

## @cmssy/react

Block authoring and the server renderers. Re-exports the core symbols above.

### Block authoring

| Export          | Signature                                 | Notes                                                                                                     |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `defineBlock`   | `(definition) => BlockDefinition`         | Declares a block; optional async server `loader`. Optional one-line `description` guides the AI composer. |
| `BlockProps`    | type: `BlockProps<typeof props, Data?>`   | Types a component **from its schema** - a renamed field becomes a compile error.                          |
| `buildBlockMap` | `(blocks: BlockDefinition[]) => BlockMap` | Maps `type` to component for rendering.                                                                   |

See [Authoring a block](../building-blocks/authoring-blocks.md). There is **no**
rich-text renderer or sanitizer - see the [rich-text recipe](../building-blocks/recipes.md).

### Server renderers & block context

| Export              | Purpose                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `CmssyServerPage`   | Renders a page's blocks server-side, running each block's loader. |
| `CmssyServerLayout` | The same for layout-region blocks (header/footer).              |
| `CmssyBlock`        | Renders a single block instance.                                  |
| `UnknownBlock`      | Placeholder for a block type the registry does not know.          |
| `buildBlockContext` | Builds the `CmssyBlockContext` passed to blocks.                  |

Both renderers take `appContext`: whatever your app hands them (a member, a
feature flag, an A/B bucket) reaches every block as `context.app`, untouched.

Both take `page`, and so do `CmssyEditableLayout`, `CmssyLazyLayout` and the
editor-data resolvers below. `CmssyServerPage` fills it from the page it
fetched; for a layout renderer you pass what you know - `{ slug }` at least,
the fetched `CmssyPageData` when you have it - and every layout block sees it
as `context.page`: `{ slug, path, id?, pageType }`, `path` being the slug split
into segments without a locale prefix. `CmssyLayoutSlot` and
`resolveCmssyLayoutSlot` derive it from the routed path, so a layout block that
depends on the routed page (a docs sidebar) reads `context.page.path` and the
route passes nothing.

`resolveCmssyLayoutSlot` - the data half every adapter's layout slot runs on -
takes `retry?: RetryOption`, forwarded to both delivery calls it makes (the site
locales and the layouts). It defaults to the `build` mode; every adapter passes
its own resolved mode straight through. It returns `groups`, the region's
`settings` (`null` when nothing was authored) and `page` (`CmssyBlockPage`,
what the layout blocks were given) next to the locale triple and, in edit
mode, `data`/`resolvedContent`/`editorOrigin`.

`resolveCmssyLayout(config, options)` is the whole slot as a function:
`resolveCmssyLayoutSlot` plus the element the slot would render - `{ groups,
settings, page, locale, defaultLocale, enabledLocales, element }`. `settings` is
typed `CmssyRegionSettingsOf<typeof config, typeof region> | null`; `element`
is `CmssyServerLayout` for a visitor and the `editable` component with
`data`/`resolvedContent` in edit mode, so `editable` is required there. The
adapters re-export it; `@cmssy/next/server` adds the Next retry default.

Types: `CmssyBlockContext`, `CmssyLocaleContext`, `CmssyBlockPage`,
`CmssyClientConfig`, `RawBlock`, `RawLayoutBlock`, `CmssyPageData`,
`CmssyPageSummary`, `CmssyPageMeta`, `CmssyLayoutGroup`, `CmssySiteConfig`,
`CmssyModelDefinition`, `CmssyModelRecord`, `CmssyFormDefinition`, and more.

### `@cmssy/react/client`

Client-only editor bridge: `CmssyLazyEditor`, `CmssyLazyLayout`,
`CmssyEditablePage`, `CmssyEditableLayout`, `useEditBridge`, `EditBridgeConfig`.

`EditBridgeConfig` is `{ editorOrigin, schemas?, blockMeta?, layoutRegions? }`.
`layoutRegions` is the site's `config.layout.regions`; when present it rides
along in `cmssy:ready` so the editor lists exactly those regions, each
`settings` schema serialized the way block `props` are into `schemas`. Next fills it
in from the config inside `createCmssyPage`; on Astro and React Router the
page result / loader data carries it back as `layoutRegions` for you to pass
to `CmssyEditor`. The same field picks the regions `loadCmssyPage` and
`createCmssyLoader` resolve editor data for, unless you pass `regions`.

### Editor data

| Export                         | Signature                                 |
| ------------------------------ | ----------------------------------------- |
| `resolveEditorBlockData`       | `(options) => Promise<{ data, content }>` |
| `resolveEditorLayoutBlockData` | `(options) => Promise<{ data, content }>` |

The canvas renders **stored** content: a block's loader has not run and a
relation field is still the ids it stores. These resolve both halves, and what
they return goes to `CmssyLazyEditor` / `CmssyLazyLayout` as `data` and
`resolvedContent`. See [wiring §5](../wiring.md).

`resolveBlockData` and `resolveLayoutBlockData` are the same two without the
editor's stored-content half - a server render that only needs each block's
loader result.

### `@cmssy/react/block-error-boundary`

`BlockErrorBoundary` (`{ blockType, blockId, editMode? }`) - a client component
that catches one block's render error so the rest of the page still renders.
`CmssyBlock` and the resolved-block renderer already wrap every block with it, so
you need this entry point only to wrap something yourself; it exists as its own
entry because a `"use client"` boundary cannot live in the server graph.

## @cmssy/next

The Next.js App Router adapter: the page route, the edit route, draft mode and
the middleware preset.

### `@cmssy/next/server`

| Export                                    | Signature                                                                                                                                                                                                                                                                     | Use in                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `createCmssyPage`                         | `(config, blocks, options?) => PageComponent`                                                                                                                                                                                                                                 | `app/[[...path]]/page.tsx`    |
| `createCmssyEditPage`                     | `(config, blocks, options?) => PageComponent`                                                                                                                                                                                                                                 | `app/cmssy-edit/[[...path]]/` |
| `createDraftRoute`                        | `(config) => (request) => Promise<Response>`                                                                                                                                                                                                                                  | `app/api/draft/route.ts`      |
| `createCmssyRevalidateRoute`              | `({ secret, tags?, toleranceSeconds? }) => (request) => Promise<Response>` - verifies a cmssy webhook delivery and expires `cmssy-content` (plus `tags`); 500 without a secret, 401 on a bad signature                                                                          | `app/api/revalidate/route.ts` |
| `CmssyLayoutSlot`                         | `(props) => Promise<JSX>` - `editMode` required, plus `path` or `locale`; `preview` fetches the draft for a `draftMode()` visitor but still renders server-side; `region` is typed to `config.layout`; optional `children({ groups, settings, page, element })` render prop | any route                     |
| `resolveCmssyLayout`                      | `(config, options) => Promise<CmssyLayoutResolution>` - the slot as a function: `{ groups, settings, page, element, ... }`, Next retry default applied                                                                                                                        | any route                     |
| `resolveCmssyLayoutSlot` (`@cmssy/react`) | `(config, options) => Promise<CmssyLayoutSlotResolution>` - the framework-free half                                                                                                                                                                                           | any adapter                   |
| `isCmssyEditMode`                         | `() => Promise<boolean>` - reads `headers()`, so it makes the route dynamic                                                                                                                                                                                                   | `/cmssy-edit` only            |

```ts
interface CreateCmssyPageOptions {
  editor?: ComponentType<CmssyEditorProps>;
  path?: string; // pin the route to one slug (e.g. "/" for a dedicated home page)
  appContext?:
    | Record<string, unknown>
    | ((args: {
        page: CmssyPageData;
        locale: string;
        path: string[];
      }) => Record<string, unknown> | Promise<Record<string, unknown>>);
  retry?: RetryOption;
  cache?: CmssyDataCacheOptions; // { revalidate: number | false; tags?: string[] }
}
```

`createCmssyPage` is statically renderable: it never reads `searchParams` or
`headers()`. Prefer the function form of `appContext` - a value fixed at module
scope cannot vary by visitor.

`retry` covers all four delivery calls a page makes - site locales, workspace id,
the page itself and its forms. It takes a **mode**, a policy object, or `false`.

```ts
type RetryOption = "build" | "interactive" | RetryPolicy | false;
```

The two modes exist because a build and a visitor want opposite things from the
same 429. A build should wait: a page that arrives 45s late is cheaper than a
failed deploy. A visitor should not: parking a request for 45s to maybe avoid an
error page is a worse outcome than the error page.

|                                | `build` | `interactive` |
| ------------------------------ | ------- | ------------- |
| `maxRetries`                   | 4       | 2             |
| `baseDelayMs` (503, transient) | 300     | 50            |
| `throttleBaseDelayMs` (429)    | 1_000   | 500           |
| `maxDelayMs`                   | 20_000  | 1_000         |
| `maxRetryAfterMs`              | 60_000  | 1_000         |
| `maxTotalWaitMs`               | 180_000 | 2_000         |

`CMSSY_RETRY_MODES` from `@cmssy/core` is that table at runtime. It is frozen -
read it, do not reconfigure it; pass a policy object at the call site instead.
Any other mode name throws on the first request that uses it, so a typo surfaces
immediately instead of silently disabling retries.

**You do not normally pick one.** `createCmssyPage` and `CmssyLayoutSlot` read
`process.env.NEXT_PHASE`: during `next build` they use `build`, and when the same
code serves a dynamic route they use `interactive`. The adapters do the same for
their own call sites - see the Astro and Remix guides.

**Your own queries get the same answer.** A Next app that calls the delivery API
itself - a `services/` gateway feeding `generateStaticParams`, `generateMetadata`
and a dynamic route from one function - would otherwise have to guess which of the
two it is in. `nextRetryMode()` from `@cmssy/next` is the check the adapters run,
exported so you do not reimplement it:

```ts
import { nextRetryMode } from "@cmssy/next";

export function publicRequest<R, V>(document, variables) {
  return graphqlRequest<R>(cmssy, print(document), variables, {
    public: true,
    retry: nextRetryMode(),
  });
}
```

It reads the env per call, never at module scope, so one module serves both
phases. `NEXT_BUILD_PHASE` is the string it compares against.

A policy object overrides field by field, on top of `build`:

```ts
interface RetryPolicy {
  maxRetries?: number;
  baseDelayMs?: number; // 503 and other transient statuses
  throttleBaseDelayMs?: number; // 429 - a throttle needs the window to roll over
  maxDelayMs?: number;
  maxRetryAfterMs?: number; // a Retry-After above this is not waited out
  maxTotalWaitMs?: number; // wall-clock budget for the waiting itself
  retryStatuses?: readonly number[]; // [429, 503]
}
```

`maxRetryAfterMs` bounds one wait; `maxTotalWaitMs` bounds all of them together,
and is what makes `interactive` a promise rather than an arithmetic accident.
When the budget runs out the call surrenders and `CmssyRequestError.waitedMs`
says how long it spent. Every scheduled retry is logged with the label, so a
build that suddenly takes minutes names its own cause.

Delays carry **full jitter** - `random(0,1) * min(maxDelayMs, base * 2 ** attempt)` -
and a honoured `Retry-After` gets a bounded random spread on top. The delivery API
answers the same window-aligned value to every caller, so without the spread N
parallel workers would wake in the same millisecond and re-throttle each other.

A mutation you send yourself through `client.query` is unaffected: `graphqlRequest`
defaults to no retry, and it retries only if you hand that call a policy - which is
worth doing only for a write you know is idempotent.

**Caching the reads.** Without `cache`, the four delivery calls a page makes are
plain POST fetches: Next never caches them, so `export const revalidate` on the
route is the only cache the site has, a publish takes up to that long to show,
and on a statically generated route an uncached fetch during on-demand
generation is a `DYNAMIC_SERVER_USAGE` error rather than a slow page. `cache`
opts the SDK's own reads into the Next data cache:

```ts
// app/[[...path]]/page.tsx
export const revalidate = 3600;
const cache = { revalidate };

const CmssyPage = createCmssyPage(cmssy, blocks, { editor: CmssyEditor, cache });
// and on every slot: <CmssyLayoutSlot ... cache={cache} />
```

Every read then carries `next: { revalidate, tags: ["cmssy-content", ...tags] }`.
Only **published** reads are cached: draft mode, a verified editor request and
the dev preview always read live, whatever `cache` says, because a preview that
shows the cache is not a preview. `revalidate: false` keeps a read until a
webhook expires it.

`CMSSY_CONTENT_TAG` (`"cmssy-content"`) is the tag `createCmssyRevalidateRoute`
expires; mount that route and point a `content.changed` webhook at it and a
publish shows up on the next request instead of after `revalidate` seconds:

```ts
// app/api/revalidate/route.ts
import { createCmssyRevalidateRoute } from "@cmssy/next/server";

export const POST = createCmssyRevalidateRoute({
  secret: process.env.CMSSY_WEBHOOK_SECRET,
});
```

The secret is passed raw, like the draft secret: a missing variable answers 500
on the first delivery and names the variable, instead of a route that verifies
nothing. `secret` also takes an array during a rotation. `tags` adds your own
tags to the expiry (`cmssy-content` is always first), `toleranceSeconds` is the
replay window `verifyCmssyWebhook` applies (300 by default). The route expires
tags for **any** verified delivery, so subscribe it to `content.changed` and
nothing else.

Your own delivery queries join the same cache with `cmssyCachedFetch`, exported
from the root the way `nextRetryMode` is:

```ts
import { cmssyCachedFetch } from "@cmssy/next";

client.query(document, variables, {
  public: true,
  fetch: cmssyCachedFetch({ revalidate: 3600 }),
});
```

It wraps the global `fetch` and adds nothing else, so `@cmssy/core` stays
framework-neutral: the `fetch` option it already had is the whole seam.

### `@cmssy/next/middleware`

| Export                      | Signature                                                      |
| --------------------------- | -------------------------------------------------------------- |
| `createCmssyProxy`          | `(config, options?) => (request) => Promise<NextResponse>`     |
| `CmssyProxyOptions`         | `{ stripLocalePrefix?, cookies? }`                             |
| `cmssyProxyMatcher`         | `string[]` - copy the value into your literal `config.matcher` |
| `cmssyEditRewrite`          | `(request, config, options?) => Promise<NextResponse \| null>` |
| `createCmssyEditMiddleware` | `(config) => (request) => Promise<NextResponse>`               |
| `isCmssyEditRequest`        | `(request, config) => Promise<boolean>`                        |
| `applyCmssyCsp`             | re-exported from core                                          |
| `CMSSY_EDIT_PATH_PREFIX`    | `"/cmssy-edit"`                                                |

`createCmssyProxy` is the whole middleware, in the order it has to happen:
resolve the language, rewrite verified editor traffic onto `/cmssy-edit` carrying
that language and the edit flag, apply the CSP, and strip the language prefix if
`stripLocalePrefix` is set.

Your app has cookies of its own to write - a refreshed session, a minted cart
id? Pass `cookies`; they are set on the response **and** merged into the cookie
header this render sees, so a refreshed session does not first render signed
out:

```ts
export const proxy = createCmssyProxy(cmssy, {
  cookies: async (request) => [...(await refreshSession(request))],
});
```

Only reach for `cmssyEditRewrite` + `applyCmssyCsp` when you need to reorder the
steps themselves.

### `@cmssy/next` (root)

`defineCmssyConfig`, `localizeHref`, `resolveEditorOrigin`,
`DEFAULT_CMSSY_EDITOR_ORIGINS`, the `CMSSY_LOCALE_HEADER` / `CMSSY_EDIT_*`
constants, `nextRetryMode`, `cmssyCachedFetch` with `CMSSY_CONTENT_TAG`, and
the `CmssyEditorProps` / `CreateCmssyPageOptions` / `CmssyDataCacheOptions`
types. This
module reads server env - never import a **value** from it into a `"use client"`
component (types are erased, values are not).

### `@cmssy/next/testing`

`checkCmssyEditMode`, re-exported from core. `@cmssy/astro/testing` does the
same; `@cmssy/remix/testing` wraps it with `editRoute: false`, because that
adapter serves the editor from the page and mounts no `/cmssy-edit` route.

## Config types

```ts
interface CmssyConfig {
  org: string; // organization slug (org-scoped delivery path)
  workspaceSlug: string;
  draftSecret: string; // generated per workspace: Settings → Headless (copy exact value)
  apiUrl?: string; // default https://api.cmssy.io/graphql
  editorOrigin?: string | string[]; // one origin, a list, or a comma-separated string; default https://cmssy.io + https://www.cmssy.io
  devToken?: string; // cs_… API token; opts into editor-controlled dev preview (development only)
  siteUrl?: string; // canonical origin, for your own SEO code
  resolveLocale?: () => string | Promise<string>; // fallback for URLs that carry no language; the workspace owns the locale set
  layout?: CmssyLayout; // defineCmssyLayout({ regions }) - the regions a layout block can live in; absent = header + footer
}
```
