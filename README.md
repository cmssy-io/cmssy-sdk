# cmssy SDK

Headless SDK for [cmssy](https://cmssy.io) — register your own React components as
blocks, render cmssy pages in your own app, and edit them visually through the cmssy
editor. cmssy keeps the backend (content, commerce, auth, forms, data) and the visual
editor; your app owns rendering and hosting.

## Packages

| Package        | Description                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cmssy/react` | Framework-agnostic core: component registry, field controls, `<CmssyPage>`, the editor bridge agent, content/data clients, the versioned postMessage protocol. |
| `@cmssy/next`  | Next.js adapter: catch-all route helper, draft mode, framing CSP.                                                                                              |

## `@cmssy/next` quickstart

Register your components once, then wire three files in your Next.js app.

```ts
// cmssy.config.ts
import type { CmssyNextConfig } from "@cmssy/next";

export const cmssy: CmssyNextConfig = {
  apiUrl: process.env.CMSSY_API_URL!,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG!,
  draftSecret: process.env.CMSSY_DRAFT_SECRET!,
  editorOrigin: process.env.CMSSY_EDITOR_ORIGIN!,
};
```

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";
import "@/cmssy/blocks"; // runs registerComponent(...) side effects

export default createCmssyPage(cmssy);
```

The cmssy editor frames this page with `?cmssyEdit=1`; `createCmssyPage` then mounts the edit bridge and serves draft content using your server-side `draftSecret` (no secret reaches the editor). Without the flag (or draft mode) it serves published content.

```ts
// app/api/draft/route.ts (Node.js runtime)
import { createDraftRoute } from "@cmssy/next";
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
} from "@cmssy/next";
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
import { isCmssyEditMode } from "@cmssy/next";
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
import { createCmssyRobots } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export default createCmssyRobots(cmssy);
```

```ts
// app/sitemap.ts
import { createCmssySitemap } from "@cmssy/next";
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
import { buildCmssyMetadata } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export async function generateMetadata({ params }) {
  const { path } = await params;
  return buildCmssyMetadata(cmssy, path); // pass locale-stripped segments
}
```

## Status

Early — built against cmssy epic CMS-642 (headless pivot). Not yet published.
