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
import { applyCmssyCsp } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const editMode =
    request.cookies.has("__prerender_bypass") ||
    request.nextUrl.searchParams.get("cmssyEdit") === "1";
  if (editMode) {
    applyCmssyCsp(response, { editorOrigin: cmssy.editorOrigin });
  }
  return response;
}
```

## Status

Early — built against cmssy epic CMS-642 (headless pivot). Not yet published.
