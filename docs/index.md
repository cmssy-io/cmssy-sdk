---
title: cmssy SDK
description: Build a headless site on cmssy - register React components as blocks, render cmssy pages in your own app, and edit them visually.
---

# cmssy SDK

cmssy is a headless, multi-tenant CMS. cmssy owns the backend - content, commerce,
auth, forms, data - and the visual block editor. **Your app owns rendering and
hosting.** You register your own React components as blocks, render cmssy pages in
your Next.js app, and editors arrange them visually through the cmssy editor.

cmssy never renders or hosts your site. It stores content and serves it over a
GraphQL delivery API; your app fetches and renders it.

## Packages

| Package              | Use it for                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `@cmssy/react`       | Core: block registry (`defineBlock`, `fields`), `CmssyServerPage`, delivery client, editor bridge. |
| `@cmssy/next`        | Next.js adapter: catch-all page route, draft mode, auth routes, SEO, CSP, locale middleware.       |
| `@cmssy/next/client` | Client helpers - `CmssyLink` (locale-aware internal navigation).                                   |

## Documentation map

- **Getting Started** - [Quickstart](./getting-started/quickstart.md): a working headless project end to end.
- **Building Blocks**
  - [Authoring a block](./building-blocks/authoring-blocks.md) - `defineBlock`, `fields`, the component contract.
  - [Server loaders](./building-blocks/server-loaders.md) - fetch data during SSR for SEO and no loading flash.
  - [Block recipes](./building-blocks/recipes.md) - rich text, listing child pages, forms, SEO.
- **Auth** - [Member auth](./auth/member-auth.md): secure httpOnly-cookie sign-in/register/sessions.
- **Reference**
  - [API reference](./reference/sdk-api.md) - every export of `@cmssy/react` + `@cmssy/next`.
  - [Delivery API](./reference/delivery-api.md) - the public GraphQL queries you can run.

> Each guide is backed by a real, compiling example. If something here disagrees
> with the SDK's behaviour, the SDK is right - please open an issue.
