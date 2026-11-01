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
import { createCmssyPage } from "@cmssy/next/server";
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

`createCmssyPage` fetches the published page for the request path and renders
it; an unpublished page answers 404. It does not handle the editor - that needs
the edit route and proxy below. A published build does **not** require
`editorOrigin`.

## Let the editor frame your site

The cmssy editor frames the page's own URL with
`?cmssyEdit=1&cmssySecret=<draft secret>`. The proxy verifies the secret and
rewrites that request to `/cmssy-edit/...`, which renders draft content with
your `editor`. Both files are required; without them the editor reports that
the preview did not respond.

```tsx
// app/cmssy-edit/[[...path]]/page.tsx
import { createCmssyEditPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy/config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export const dynamic = "force-dynamic";

export default createCmssyEditPage(cmssy, blocks, { editor: CmssyEditor });
```

```ts
// proxy.ts (Next.js 16) - on Next.js 15 name it middleware.ts and export `middleware`
import { createCmssyProxy } from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy/config";

export const proxy = createCmssyProxy(cmssy);
export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
```

`proxy.ts` sits next to `app/` (in `src/` when the app is `src/app`). Set the
workspace preview URL to the exact deployed origin, e.g.
`https://my-site.vercel.app`.

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

`createCmssyProxy` already sets it on editor requests. For a hand-written proxy,
`applyCmssyCsp(response, { editorOrigin: cmssy.editorOrigin })` from
`@cmssy/next/middleware` lets the cmssy editor frame the response.

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

The root layout can't read the path, so the proxy resolves the locale from the
path prefix: the `createCmssyProxy` from the editor section already does it.

`localizeHref(href, locale)` and the `CMSSY_LOCALE_HEADER` constant are
re-exported from `@cmssy/next` (and `@cmssy/core`).

## Exports

`@cmssy/next/server`: `createCmssyPage`, `createCmssyEditPage`,
`createDraftRoute`, `createCmssyRevalidateRoute`, `createCmssyBlockDataRoute`,
`CmssyLayoutSlot`,
`resolveCmssyLayout`, `isCmssyEditMode`. `@cmssy/next/middleware`:
`createCmssyProxy`, `cmssyEditRewrite`, `applyCmssyCsp`, `isCmssyEditRequest`.
Root: `defineCmssyConfig`, `localizeHref`, `nextRetryMode`, `cmssyCachedFetch`,
`CMSSY_CONTENT_TAG` and the types. The full list, with signatures, is in
[docs/reference/sdk-api.md](../../docs/reference/sdk-api.md).

## Versioning: this package, not the API

**Pinning this package does not pin the API it talks to.** The package version
covers this client - its exports and their behaviour, normal semver. The cmssy
delivery API is a hosted service whose GraphQL schema can change on any deploy,
without a release here.

There is no dated API version to pin; the delivery endpoint has no version
segment. What protects you today is that a breaking schema change cannot merge
silently - it is caught by a gate that validates the SDK's own operations, and
shipping one anyway takes a recorded approval - and that fields we intend to
remove are marked `@deprecated` first. There is no guaranteed deprecation window
and no minimum notice period. Details in
[`@cmssy/core`](https://www.npmjs.com/package/@cmssy/core).

## License

MIT
