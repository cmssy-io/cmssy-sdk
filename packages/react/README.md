# @cmssy/react

React building blocks for a [cmssy](https://cmssy.com) headless site: define
blocks, render published content, fetch data from the public delivery API, and
drive the live editor bridge. Framework-agnostic React; for Next.js App Router
wiring use [`@cmssy/next`](https://www.npmjs.com/package/@cmssy/next).

```bash
pnpm add @cmssy/react
```

## Define a block

A block is a plain React component plus a field schema the editor reads.

```tsx
import { defineBlock, fields } from "@cmssy/react";
import Hero from "./Hero";

export const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: {
    heading: fields.singleLine({ label: "Heading", required: true }),
    subheading: fields.multiLine({ label: "Subheading" }),
    cta: fields.link({ label: "CTA" }),
    image: fields.media({ label: "Image" }),
  },
});
```

`fields` covers `singleLine`, `multiLine`, `link`, `media`, `boolean`,
`repeater`, and more. The block component receives `{ content }` resolved from
the CMS at runtime.

## Render published content

```tsx
import { fetchPage, CmssyServerPage } from "@cmssy/react";

const page = await fetchPage(
  { org: "acme-org", workspaceSlug: "acme" },
  pathSegments,
);

return <CmssyServerPage page={page} blocks={blocks} locale="en" />;
```

`CmssyServerLayout` renders header/footer layout groups the same way. Both are
Server Components — no block JavaScript ships to the client unless a block needs
it.

## Fetch data

One generic GraphQL client over the public API — write your own queries (or use
the exported documents):

```ts
import { createCmssyClient, MODEL_RECORDS_QUERY } from "@cmssy/react";

const cmssy = createCmssyClient({ org: "acme-org", workspaceSlug: "acme" });

// raw query (you own scoping)
await cmssy.query(MY_QUERY, vars);

// workspace-scoped (auto x-workspace-id header + $workspaceId var)
const {
  public: {
    model: { records },
  },
} = await cmssy.queryScoped(MODEL_RECORDS_QUERY, {
  modelSlug: "posts",
});
```

Ready-made documents + result types: `SITE_CONFIG_QUERY`,
`MODEL_DEFINITIONS_QUERY`, `MODEL_RECORDS_QUERY`, `FORM_QUERY`,
`SUBMIT_FORM_MUTATION`.

## Live editor (client)

`@cmssy/react/client` exposes the lazy editor + layout wrappers that keep block
chunks isolated:

```tsx
"use client";
import { CmssyLazyEditor } from "@cmssy/react/client";

export const CmssyEditor = (props) => (
  <CmssyLazyEditor {...props} load={() => import("./blocks")} />
);
```

The editor talks to the cmssy admin over the `cmssy:*` bridge protocol for live
preview.

## License

MIT
