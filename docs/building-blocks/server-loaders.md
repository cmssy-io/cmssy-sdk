---
title: Server loaders
description: Fetch a block's data during server-side rendering so it is crawlable, renders without a loading flash, and keeps server-only dependencies out of the client bundle.
---

# Server loaders

A block's `loader` runs **on the server during SSR** and passes its result to the
block component as the `data` prop. Use it to fetch content, run heavy
transforms, or call the delivery API before the page is sent to the browser -
instead of fetching client-side in a `useEffect`.

Why it matters:

- **SEO** - the content is in the server-rendered HTML, so crawlers see it.
- **No flash** - the block renders populated on first paint; no skeleton.
- **Smaller client bundle** - server-only dependencies (a syntax highlighter, an
  HTML sanitizer) never reach the browser.

## The contract

```ts
import { defineBlock } from "@cmssy/react";

defineBlock({
  type: "my-block",
  loader: async ({ content, context }) => {
    // runs on the server, during SSR only; returns RSC-serializable data
    return { html: "" };
  },
  component: MyBlock, // receives { content, context, data }
});
```

Rules:

- The loader runs in `CmssyServerPage` during SSR, and in the editor whenever
  the app mounts the block data route below. Mount it: without it a loader block
  is frozen in the editor - it keeps whatever the page was rendered with, and a
  block the editor has just added has nothing at all.
- The return value crosses the server→client boundary, so it must be
  **RSC-serializable**: plain objects, arrays, and primitives. No functions or
  class instances.
- `content` is the block's resolved content; `context` is the
  `CmssyBlockContext` (`locale`, `isPreview`, `forms`).

The component types `data` as optional and degrades when it is missing:

```tsx
function MyBlock({
  content,
  data,
}: {
  content: Record<string, unknown>;
  data?: { html?: string };
}) {
  if (!data?.html) return <pre>{String(content.code ?? "")}</pre>;
  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}
```

Returning `null` when the data is empty is a legitimate answer for the public
site - an empty product grid should not leave a heading over nothing. Know what
it costs in the editor: a block that renders nothing occupies no space, so there
is nothing to click. The editor names it in the invisible-blocks notice rather
than leaving you to guess, but a block you can see is easier to fix than a block
you are told about.

## Resolving loaders as the editor types

The editor patches a block's **content** over the bridge; it cannot run your
loader, which is server code holding your API credentials. Mount one route and
the editor gets a way to ask the server for it:

```ts
// app/api/cmssy/block-data/route.ts
import { createCmssyBlockDataRoute } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";

export const POST = createCmssyBlockDataRoute(cmssy, blocks);
```

The route answers **only a verified editor request** - the same signal
`createCmssyPage` uses to decide it is being framed. Anything else gets a 403,
so mounting it does not expose your loaders to the internet.

With it mounted, changing a category or a limit in the inspector re-runs the
loader and the block updates in place. Without it, the SDK logs one warning and
leaves the block with the data the page was rendered with.

The default path is `/api/cmssy/block-data`. If you mount it elsewhere, tell the
bridge: `edit={{ ...edit, blockDataUrl: "/your/path" }}`.

### Astro and Remix

`handleBlockDataRequest` from `@cmssy/react` is the framework-agnostic half - it
takes the parsed body and your blocks and returns the `Response`:

```ts
import { handleBlockDataRequest } from "@cmssy/react";

export async function action({ request }) {
  if (!isYourEditorRequest(request)) return new Response(null, { status: 403 });
  return handleBlockDataRequest(await request.json(), {
    blocks,
    config: cmssy,
  });
}
```

It does not authenticate - that is the `isYourEditorRequest` line, and on these
two adapters you have to write it yourself. The Next adapter can check
`isCmssyEditMode()` because its proxy turns a verified edit request into a
request header that survives to every route. Astro and Remix carry the edit
signal in the page URL and re-verify it per request, so a POST from the framed
page arrives with nothing to check. Until that is closed, only the Next route
ships ready to mount.

## Keep server-only code out of the client bundle

A block module is also reachable from the editor's client bundle. If your loader
statically imports a server-only or heavy dependency, it gets bundled for the
browser too. Two guards prevent that:

1. **Dynamic `import()` inside the loader** - the dependency is only pulled in
   when the loader actually runs (on the server).
2. **A runtime `window` guard** in any shared server helper - a hard failure if
   it is ever reached on the client.

```ts
// block.ts
loader: async ({ content }) => {
  const code = typeof content.code === "string" ? content.code : "";
  if (!code) return { html: "" };
  const { codeToHtml } = await import("shiki"); // server-only, lazy
  return { html: await codeToHtml(code, { lang: "ts", theme: "github-light" }) };
},
```

```ts
// load-posts.ts (a server-only helper imported via dynamic import())
import { createCmssyClient } from "@cmssy/react";
import { cmssy } from "@/cmssy.config";

const client = createCmssyClient(cmssy);

export async function loadPosts(vars: { parentSlug: string; limit: number }) {
  if (typeof window !== "undefined") {
    throw new Error("loadPosts must only run on the server");
  }
  const data = await client.queryScoped<{
    publicPagesByType?: { items?: unknown[]; hasMore?: boolean };
  }>(PUBLIC_PAGES_QUERY, vars);
  const r = data?.publicPagesByType;
  return r ? { items: r.items ?? [], hasMore: !!r.hasMore } : null;
}
```

```ts
// block.ts - the loader stays tiny; the helper is only imported on the server
loader: async ({ content }) => {
  const parentSlug = resolveParentSlug(content);
  if (!parentSlug) return null;
  const { loadPosts } = await import("./load-posts");
  return loadPosts({ parentSlug, limit: Number(content.postsPerPage) || 9 });
},
```

## Calling the delivery API

Use `createCmssyClient(...).queryScoped(...)` (or `graphqlRequest`) from
`@cmssy/react`. `queryScoped` **auto-injects `workspaceId`**: when your query
declares `$workspaceId` and you do not pass it, the SDK resolves it from your
`workspaceSlug` and adds both the variable and the `x-workspace-id` header. You
do not manage the workspace id yourself.

## Hybrid: SSR first page, client interactivity after

A loader does not have to own all data forever. A common pattern: load the first
page server-side via the loader, seed the client hook's initial state from
`data`, and keep search / pagination / filtering on the client.

```tsx
function BlogPosts({ content, context, data }) {
  // seed initial state from the SSR `data`; client effects handle the rest
  const state = useBlogPosts(content, context, data);
  // ...
}
```

When `data` is present the client skips its initial fetch entirely; only
user-driven actions (typing a search, scrolling for more) hit the network.

## Worked examples in this repo

| Block             | Loader does                                    | Server-only dep |
| ----------------- | ---------------------------------------------- | --------------- |
| `docs-code-block` | Server-side syntax highlighting → `data.html`  | `shiki`         |
| `legal`           | Sanitizes CMS-authored HTML → `data.sections`  | `sanitize-html` |
| `blog-posts`      | Fetches the first page of posts → `data.items` | delivery API    |

## Checklist

- [ ] Loader returns RSC-serializable data (plain objects/arrays/primitives).
- [ ] `createCmssyBlockDataRoute` is mounted, so the editor can resolve loaders.
- [ ] Component renders a fallback when `data` is `undefined`.
- [ ] Server-only deps are behind dynamic `import()`.
- [ ] Shared server helpers guard on `typeof window !== "undefined"`.
- [ ] Delivery calls use `queryScoped` / `graphqlRequest` (workspace auto-scoped).
