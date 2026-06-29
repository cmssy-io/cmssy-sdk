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
    // runs on the server, during SSR only
    return {/* RSC-serializable data */};
  },
  component: MyBlock, // receives { content, context, data }
});
```

Rules:

- The loader runs in `CmssyServerPage` during SSR. **It does not run in the
  editor** - there the component receives `data: undefined`. Always render a
  sensible fallback when `data` is absent.
- The return value crosses the server→client boundary, so it must be
  **RSC-serializable**: plain objects, arrays, and primitives. No functions or
  class instances.
- `content` is the block's resolved content; `context` is the
  [`CmssyBlockContext`](#context) (`locale`, `isPreview`, `forms`).

The component types `data` as optional and degrades when it is missing:

```tsx
function MyBlock({
  content,
  data,
}: {
  content: Record<string, unknown>;
  data?: { html?: string };
}) {
  if (!data?.html) return <pre>{String(content.code ?? "")}</pre>; // editor fallback
  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}
```

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
- [ ] Component renders a fallback when `data` is `undefined` (editor).
- [ ] Server-only deps are behind dynamic `import()`.
- [ ] Shared server helpers guard on `typeof window !== "undefined"`.
- [ ] Delivery calls use `queryScoped` / `graphqlRequest` (workspace auto-scoped).
