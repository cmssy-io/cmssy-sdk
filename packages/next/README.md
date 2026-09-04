# @cmssy/next

Next.js (App Router) bindings for a [cmssy](https://cmssy.com) headless site.
One catch-all route renders your published cmssy content with local block
components, with live edit-mode preview built in. Pairs with
[`@cmssy/react`](https://www.npmjs.com/package/@cmssy/react) (blocks + data).

```bash
pnpm add @cmssy/next @cmssy/react
```

## Render every page

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage } from "@cmssy/next";
import { cmssy } from "@/cmssy/config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
```

```ts
// cmssy/config.ts
import { defineCmssyConfig } from "@cmssy/next";

// defineCmssyConfig validates the required env vars and throws a clear error if
// any is missing - never mask them with `?? ""` (an empty org/slug builds a
// broken delivery URL like `/public//graphql`).
export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET, // edit-mode preview handshake
  // apiUrl + editorOrigin default to cmssy cloud; set them only for self-host/staging.
  // Locales come from the workspace site config - no need to repeat them here.
});
```

`createCmssyPage` fetches the page for the request path and renders it. In edit
mode (draft cookie or `?cmssyEdit=1`) it renders your `editor` instead and frames
the live-edit bridge. A published build does **not** require `editorOrigin`.

## Draft preview

```ts
// app/api/draft/route.ts
import { createDraftRoute } from "@cmssy/next/server";
export const GET = createDraftRoute(cmssy);
```

## Cache, and expire it on publish

```ts
// app/[[...path]]/page.tsx
export const revalidate = 3600;
const cache = { revalidate };
export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor, cache });

// app/api/revalidate/route.ts
import { createCmssyRevalidateRoute } from "@cmssy/next/server";
export const POST = createCmssyRevalidateRoute({
  secret: process.env.CMSSY_WEBHOOK_SECRET,
});
```

`cache` puts the SDK's published reads into the Next data cache under the
`cmssy-content` tag; the route expires that tag for a verified `content.changed`
webhook. Draft mode and the editor always read live.

## Edit-mode CSP

```ts
import { cmssyCspHeaders, applyCmssyCsp } from "@cmssy/next";
```

Helpers to frame the page inside the cmssy editor only in edit mode.

## Localized navigation (path prefix)

The active locale lives in the URL path prefix (`/en/about`; the default locale
stays bare). `createCmssyPage` resolves it and exposes it via `CmssyLocaleProvider`.
For the locale to survive navigation, internal links must carry the prefix -
prefix hrefs yourself with `localizeHref` and pass the result to `next/link`:

```tsx
// any block component
import Link from "next/link";
import { localizeHref } from "@cmssy/next";

<Link href={localizeHref("/about", locale)}>About</Link>; // → /en/about while EN is active
```

Add middleware so the root layout (which can't read the path) resolves the right
locale from the path prefix. On Next.js 16 the file is `proxy.ts` (the renamed
middleware convention); on Next.js 15 use `middleware.ts` with the same body.

```ts
// proxy.ts (Next.js 16) — or middleware.ts on Next.js 15
import { createCmssyLocaleMiddleware } from "@cmssy/next";
import { cmssy } from "@/cmssy/config";

export const proxy = createCmssyLocaleMiddleware(cmssy);
export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
```

On Next.js 15, name the file `middleware.ts` and rename the export to
`middleware` (`export const middleware = createCmssyLocaleMiddleware(cmssy)`).

`localizeHref(href, locale)` and the `CMSSY_LOCALE_HEADER` constant are
re-exported from `@cmssy/next` (and `@cmssy/core`).

## Exports

`@cmssy/next/server`: `createCmssyPage`, `createCmssyEditPage`,
`createDraftRoute`, `createCmssyRevalidateRoute`, `CmssyLayoutSlot`,
`resolveCmssyLayout`, `isCmssyEditMode`. `@cmssy/next/middleware`:
`createCmssyProxy`, `cmssyEditRewrite`, `applyCmssyCsp`, `isCmssyEditRequest`.
Root: `defineCmssyConfig`, `localizeHref`, `nextRetryMode`, `cmssyCachedFetch`
and the types. The full list, with signatures, is in
[docs/reference/sdk-api.md](../../docs/reference/sdk-api.md).

## License

MIT
