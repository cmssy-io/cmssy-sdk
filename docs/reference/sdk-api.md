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

| Export              | Signature                                 | Notes                                                          |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| `defineCmssyConfig` | `(config: CmssyEnvConfig) => CmssyConfig` | Validates env-sourced values; throws naming every missing one. |
| `CmssyConfig`       | type                                      | The validated config (see [below](#config-types)).             |
| `CmssyEnvConfig`    | type                                      | The same with the required fields widened to `\| undefined`.   |

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
self-hosted endpoint check.

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
`CmssyWebhookOrder`. All from `@cmssy/core`.

### `@cmssy/core/testing` and `/preflight`

`checkCmssyEditMode({ baseUrl, secret })` proves a deployed site can still be
**edited** - see [testing](../testing.md). `/preflight` holds the diagnostics the
CLI renders: `collectEditDiagnostics`, `checkWorkspaceReachable`,
`checkDraftSecret`, `checkPreviewUrl`, `checkFrameAncestors`, `buildEditorUrl`.

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
| `CmssyServerLayout` | The same for layout-position blocks (header/footer).              |
| `CmssyBlock`        | Renders a single block instance.                                  |
| `UnknownBlock`      | Placeholder for a block type the registry does not know.          |
| `buildBlockContext` | Builds the `CmssyBlockContext` passed to blocks.                  |

Both renderers take `appContext`: whatever your app hands them (a member, a
feature flag, the active path) reaches every block as `context.app`, untouched.

Types: `CmssyBlockContext`, `CmssyLocaleContext`, `CmssyBlockPage`,
`CmssyClientConfig`, `RawBlock`, `RawLayoutBlock`, `CmssyPageData`,
`CmssyPageSummary`, `CmssyPageMeta`, `CmssyLayoutGroup`, `CmssySiteConfig`,
`CmssyModelDefinition`, `CmssyModelRecord`, `CmssyFormDefinition`, and more.

### `@cmssy/react/client`

Client-only editor bridge: `CmssyLazyEditor`, `CmssyLazyLayout`,
`CmssyEditablePage`, `CmssyEditableLayout`, `useEditBridge`, `EditBridgeConfig`.

### Editor data

| Export                         | Signature                                 |
| ------------------------------ | ----------------------------------------- |
| `resolveEditorBlockData`       | `(options) => Promise<{ data, content }>` |
| `resolveEditorLayoutBlockData` | `(options) => Promise<{ data, content }>` |

The canvas renders **stored** content: a block's loader has not run and a
relation field is still the ids it stores. These resolve both halves, and what
they return goes to `CmssyLazyEditor` / `CmssyLazyLayout` as `data` and
`resolvedContent`. See [wiring §5](../wiring.md).

## @cmssy/next

The Next.js App Router adapter: the page route, the edit route, draft mode and
the middleware preset.

### `@cmssy/next/server`

| Export                                    | Signature                                                                           | Use in                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| `createCmssyPage`                         | `(config, blocks, options?) => PageComponent`                                       | `app/[[...path]]/page.tsx`    |
| `createCmssyEditPage`                     | `(config, blocks, options?) => PageComponent`                                       | `app/cmssy-edit/[[...path]]/` |
| `createDraftRoute`                        | `(config) => (request) => Promise<Response>`                                        | `app/api/draft/route.ts`      |
| `CmssyLayoutSlot`                         | `(props) => Promise<JSX>` - `editMode` required, plus `path` or `locale`            | any route                     |
| `resolveCmssyLayoutSlot` (`@cmssy/react`) | `(config, options) => Promise<CmssyLayoutSlotResolution>` - the framework-free half | any adapter                   |
| `isCmssyEditMode`                         | `() => Promise<boolean>` - reads `headers()`, so it makes the route dynamic         | `/cmssy-edit` only            |

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
}
```

`createCmssyPage` is statically renderable: it never reads `searchParams` or
`headers()`. Prefer the function form of `appContext` - a value fixed at module
scope cannot vary by visitor.

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
constants, and the `CmssyEditorProps` / `CreateCmssyPageOptions` types. This
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
}
```
