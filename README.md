# cmssy SDK

Headless SDK for [cmssy](https://cmssy.io): render cmssy pages in your own app and
edit them visually through the cmssy editor. cmssy keeps the backend (content,
commerce, auth, forms, data) and the editor; your app owns rendering and hosting.

**The framework is an adapter, never the foundation.** Everything that is not
rendering - the data layer, the config, the editor protocol - lives in
`@cmssy/core`, which imports no framework at all. A test fails the build if that
ever stops being true.

cmssy never scaffolds your app. Create it with your framework's own CLI, then
wire cmssy into it:

```bash
npx create-next-app@latest my-site   # or: npm create astro@latest / npx create-react-router@latest
cd my-site
npx @cmssy/cli init   # generates the cmssy wiring for the detected framework
npx @cmssy/cli link   # connects it to your workspace
```

## Packages

| Package                | Description                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cmssy/core`          | No framework, no Node built-ins: transport, queries, config, secrets, webhooks, the versioned postMessage protocol.                          |
| `@cmssy/react`         | Rendering: block registry, field controls, `CmssyServerPage`, the edit bridge.                                                               |
| `@cmssy/next`          | Next.js bindings, one entry per runtime: `/server`, `/middleware`, `/client`.                                                                |
| `@cmssy/remix`         | React Router 7 bindings: page loader, framing CSP, sitemap, robots. No edit route needed - a React Router page always sees its query string. |
| `@cmssy/astro`         | Astro bindings: middleware, page loader, sitemap, robots. Depends on `@cmssy/core` alone - no React, no Next.                                |
| `@cmssy/eslint-plugin` | Catches the crash a build cannot: a client component reaching the cmssy config.                                                              |
| `@cmssy/codemod`       | `npx @cmssy/codemod v5 .` - rewrites imports across a major.                                                                                 |
| `@cmssy/cli`           | [`cmssy init`](docs/cli.md) generates the cmssy wiring into an existing app; [`cmssy link`](docs/cli.md) connects it to a workspace.         |

## Docs

|                                                    |                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [**Architecture**](docs/architecture.md)           | What lives in which package, and why. The framework is an adapter, never the foundation.   |
| [**Reference wiring**](docs/wiring.md)             | The complete, correct way to mount cmssy - copy it whole. The pieces depend on each other. |
| [**Troubleshooting**](docs/troubleshooting.md)     | Symptom → cause. Every row cost us half a day, and none of them failed a build.            |
| [**Testing**](docs/testing.md)                     | `checkCmssyEditMode` - the editor is the one path a build cannot check.                    |
| [**Migrating to v9**](docs/migrations/v8-to-v9.md) | The config locale override is gone. The workspace languages rule everywhere.               |
| [**Migrating to v8**](docs/migrations/v7-to-v8.md) | A block's content is typed by its schema. A renamed field is now a build error.            |
| [**Migrating to v5**](docs/migrations/v4-to-v5.md) | One command: `npx @cmssy/codemod v5 .`. The imports moved; the wiring did not.             |
| [**Migrating to v4**](docs/migrations/v3-to-v4.md) | The editor moved to its own route. Skip this and your preview goes blank.                  |
| [**Changelog**](CHANGELOG.md)                      | Every entry answers one question: do I have to do anything?                                |

## Wiring, the short version

```ts
// proxy.ts
import { createCmssyProxy } from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy.config";

export const proxy = createCmssyProxy(cmssy);
export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
```

```tsx
// app/[[...path]]/page.tsx        - the public pages
export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });

// app/cmssy-edit/[[...path]]/page.tsx  - the editor. Miss this file and the
export const dynamic = "force-dynamic"; //  preview is blank.
export default createCmssyEditPage(cmssy, blocks, { editor: CmssyEditor });
```

```tsx
// app/layout.tsx - the header and footer are blocks, so they are editable too
<CmssyLayoutSlot
  config={cmssy}
  blocks={blocks}
  position="header"
  editable={EditableLayout}
/>
```

Full version, with the reasons: [docs/wiring.md](docs/wiring.md).

## `@cmssy/next` quickstart

Collect your blocks in one array, then wire these files in your Next.js app.

```ts
// cmssy.config.ts
import type { CmssyConfig } from "@cmssy/next";

export const cmssy: CmssyConfig = {
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG!,
  draftSecret: process.env.CMSSY_DRAFT_SECRET!,
  // apiUrl + editorOrigin default to cmssy cloud; set them only for self-host/staging.
};
```

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks"; // array of defineBlock(...) results

export default createCmssyPage(cmssy, blocks);
```

The cmssy editor frames this page with `?cmssyEdit=1`; `createCmssyPage` then mounts the edit bridge and serves draft content using your server-side `draftSecret` (no secret reaches the editor). Without the flag (or draft mode) it serves published content.

To preview in-progress editor edits on your **own** local site during development, set a `devToken` and toggle dev-mode in the editor - see [Dev preview](docs/getting-started/quickstart.md#7-dev-preview-optional).

```ts
// app/api/draft/route.ts (Node.js runtime)
import { createDraftRoute } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";

export const GET = createDraftRoute(cmssy);
```

```ts
// middleware.ts — let the cmssy editor frame the app in edit mode
import { NextResponse, type NextRequest } from "next/server";
import {
  applyCmssyCsp,
  isCmssyEditRequest,
  CMSSY_EDIT_HEADER,
} from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy.config";

export function middleware(request: NextRequest) {
  const editMode = isCmssyEditRequest(request);

  // Forward edit mode to server components (the root layout can't read
  // searchParams). Strip any inbound value first so a client can't forge it.
  const headers = new Headers(request.headers);
  headers.delete(CMSSY_EDIT_HEADER);
  if (editMode) headers.set(CMSSY_EDIT_HEADER, "1");

  const response = NextResponse.next({ request: { headers } });
  if (editMode) applyCmssyCsp(response, { editorOrigin: cmssy.editorOrigin });
  return response;
}
```

In your root `layout.tsx`, read `isCmssyEditMode()` to fetch draft vs published
layout blocks on the same signal as page content:

```tsx
import { isCmssyEditMode } from "@cmssy/next/server";
import { fetchLayouts } from "@cmssy/react";

const editMode = await isCmssyEditMode();
const groups = await fetchLayouts(client, "/", {
  previewSecret: editMode ? cmssy.draftSecret : undefined,
});
```

> **Security.** `?cmssyEdit=1` is a developer-controllable flag, so any request can
> opt into edit mode — equivalent to setting `x-cmssy-edit` directly, which is why the
> middleware **must strip the inbound header before setting it** (above). This is not an
> escalation: `frame-ancestors` only _restricts_ framing to your trusted `editorOrigin`
> (set it to a concrete origin, never `*`), and actual draft **content** is still gated by
> the server-held `draftSecret` at fetch time. For production, gate the edit path behind a
> server-set capability (auth/session cookie or signed token) and scope this middleware
> with `config.matcher` to editable routes only.

### SEO: robots.txt + sitemap.xml

Drop in Next's metadata routes. Both derive the canonical origin from the
request `host` (multi-domain safe), or from `config.siteUrl` when set.

```ts
// app/robots.ts
import { createCmssyRobots } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";

export default createCmssyRobots(cmssy);
```

```ts
// app/sitemap.ts
import { createCmssySitemap } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";

export default createCmssySitemap(cmssy);
```

`createCmssySitemap` lists the workspace's published pages and emits per-locale
`alternates` when `config.enabledLocales` has more than one entry. The
workspace's configured 404 page (Settings → 404 page) is excluded
automatically; pass `excludeSlugs` for any other paths you want omitted.

### Page metadata (SEO + Open Graph)

`buildCmssyMetadata` produces complete Next.js `Metadata` for a page from its
SEO fields and the workspace branding - title/description/keywords, canonical +
per-locale `hreflang` alternates, and Open Graph / Twitter cards (with the
branding OG image). Use it in a route's `generateMetadata`:

```ts
// app/[[...path]]/page.tsx
import { buildCmssyMetadata } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";

export async function generateMetadata({ params }) {
  const { path } = await params;
  return buildCmssyMetadata(cmssy, path); // pass locale-stripped segments
}
```

## Status

Early — built against cmssy epic CMS-642 (headless pivot). Not yet published.
