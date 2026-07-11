---
title: Block recipes
description: Copy-paste patterns for the blocks every cmssy site needs - rendering rich text safely, listing child pages, submitting a form, and wiring SEO metadata.
---

# Block recipes

Concrete, working patterns for the things most cmssy projects need. Each recipe
uses only what the SDK actually exports; where the SDK has no helper (rich-text
sanitizing, listing child pages), the recipe gives the canonical consumer-side
pattern you implement in your own app.

## Render rich text safely

The SDK does **not** sanitize or render rich text for you - a `fields.richText`
value is just an HTML string. Rendering it with `dangerouslySetInnerHTML`
unsanitized is an XSS risk. Sanitize on the server in a [loader](./server-loaders.md)
so the dependency stays out of the client bundle, then render the clean HTML.

```ts
// blocks/prose/block.ts
import { defineBlock, fields } from "@cmssy/react";
import Prose from "./Prose";

export const proseBlock = defineBlock({
  type: "prose",
  label: "Prose",
  component: Prose,
  props: {
    body: fields.richText({ label: "Body" }),
  },
  loader: async ({ content }) => {
    const html = typeof content.body === "string" ? content.body : "";
    if (!html) return { html: "" };
    const { default: sanitizeHtml } = await import("sanitize-html");
    const clean = sanitizeHtml(html, {
      allowedTags: [
        "p",
        "strong",
        "em",
        "ul",
        "ol",
        "li",
        "a",
        "h2",
        "h3",
        "br",
      ],
      allowedAttributes: { a: ["href", "target", "rel"] },
      allowedSchemes: ["http", "https", "mailto", "tel"],
    });
    return { html: clean };
  },
});
```

```tsx
// blocks/prose/Prose.tsx
export default function Prose({ data }: { data?: { html?: string } }) {
  if (!data?.html) return null; // editor: loader did not run
  return (
    <div
      className="prose max-w-none"
      dangerouslySetInnerHTML={{ __html: data.html }}
    />
  );
}
```

The loader does not run in the editor, so guard on `data` being absent. Add
`sanitize-html` (and `@types/sanitize-html`) to your project.

## List child pages (a blog index)

There is no SDK helper for listing pages under a parent - you write the query and
run it through `queryScoped`, which auto-injects `workspaceId`. The delivery API
exposes `publicPagesByType` for this (see [Delivery API](../reference/delivery-api.md)).

```ts
// blocks/blog-index/posts-query.ts
export const PUBLIC_PAGES_BY_TYPE = `query PublicPagesByType(
  $workspaceId: String!
  $parentSlug: String
  $limit: Int
  $offset: Int
) {
  publicPagesByType(
    workspaceId: $workspaceId
    parentSlug: $parentSlug
    limit: $limit
    offset: $offset
  ) {
    items {
      id
      slug
      fullSlug
      publishedAt
      displayName
      seoTitle
      seoDescription
    }
    hasMore
  }
}`;
```

```ts
// blocks/blog-index/load-posts.ts - server-only helper, imported via dynamic import()
import { createCmssyClient } from "@cmssy/react";
import { cmssy } from "@/cmssy.config";
import { PUBLIC_PAGES_BY_TYPE } from "./posts-query";

const client = createCmssyClient(cmssy);

type PostsResult = { items: unknown[]; hasMore: boolean };

export async function loadPosts(vars: { parentSlug: string; limit: number }) {
  if (typeof window !== "undefined") {
    throw new Error("loadPosts is server-only");
  }
  const data = await client.queryScoped<{
    publicPagesByType?: { items?: unknown[]; hasMore?: boolean } | null;
  }>(PUBLIC_PAGES_BY_TYPE, { ...vars, offset: 0 });
  const r = data?.publicPagesByType;
  return r ? { items: r.items ?? [], hasMore: !!r.hasMore } : null;
}
```

```ts
// blocks/blog-index/block.ts
import { defineBlock, fields } from "@cmssy/react";
import BlogIndex from "./BlogIndex";

export const blogIndexBlock = defineBlock({
  type: "blog-index",
  label: "Blog index",
  component: BlogIndex,
  props: {
    parentSlug: fields.singleLine({
      label: "Parent slug",
      placeholder: "/blog",
    }),
    postsPerPage: fields.numeric({ label: "Posts per page", defaultValue: 9 }),
  },
  loader: async ({ content }) => {
    const parentSlug =
      typeof content.parentSlug === "string" ? content.parentSlug : "";
    if (!parentSlug) return null;
    const { loadPosts } = await import("./load-posts");
    return loadPosts({ parentSlug, limit: Number(content.postsPerPage) || 9 });
  },
});
```

`queryScoped` resolves `workspaceId` from your `workspaceSlug` and injects it as
both the variable and the `x-workspace-id` header - you never pass it yourself.

## Submit a form

The Form Builder owns validation, storage, email, and webhooks. Your block
renders the form definition (injected into `context.forms`) and submits with the
exported `SUBMIT_FORM_MUTATION`. The submit runs server-side so it is never
spoofable from the client.

```ts
// blocks/contact/block.ts
import { defineBlock, fields } from "@cmssy/react";
import Contact from "./Contact";

export const contactBlock = defineBlock({
  type: "contact",
  label: "Contact",
  component: Contact,
  props: {
    formId: fields.singleLine({ label: "Form ID" }),
  },
});
```

```ts
// blocks/contact/actions.ts
"use server";
import {
  createCmssyClient,
  SUBMIT_FORM_MUTATION,
  type CmssyFormSubmitResponse,
} from "@cmssy/react";
import { cmssy } from "@/cmssy.config";

const client = createCmssyClient(cmssy);

export async function submitForm(formId: string, data: Record<string, string>) {
  const res = await client.queryScoped<{
    public: { form: { submit: CmssyFormSubmitResponse } };
  }>(SUBMIT_FORM_MUTATION, { formId, input: { data } });
  return res.public.form.submit; // { success, message, submissionId, ... }
}
```

```tsx
// blocks/contact/Contact.tsx
import type { CmssyBlockContext } from "@cmssy/react";

export default function Contact({
  content,
  context,
}: {
  content: { formId?: string };
  context?: CmssyBlockContext;
}) {
  const formId = content.formId;
  const formDef = formId ? context?.forms?.[formId] : undefined;
  if (!formDef) return null;
  // render formDef.fields, then call submitForm(formId, values) from actions.ts
  return <form>{/* fields from formDef.fields */}</form>;
}
```

The form's field and settings shape (`formDef.fields`, `formDef.settings`) comes
from `FORM_QUERY` / `context.forms` - see the [Delivery API](../reference/delivery-api.md).

## SEO metadata

Export `generateMetadata` from your catch-all route and delegate to
`buildCmssyMetadata` - it fetches the page's SEO fields from the delivery API and
returns a Next.js `Metadata` object.

```tsx
// app/[[...path]]/page.tsx
import { buildCmssyMetadata } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  return buildCmssyMetadata(cmssy, path);
}
```

For a sitemap and robots file, use `createCmssySitemap(cmssy)` and
`createCmssyRobots(cmssy)` as the default exports of `app/sitemap.ts` and
`app/robots.ts`. See the [API reference](../reference/sdk-api.md).
