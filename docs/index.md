---
title: cmssy SDK
description: Build a headless site on cmssy with Next.js, Astro or React Router - render cmssy pages in your own app and edit them visually.
---

# cmssy SDK

cmssy is a headless, multi-tenant CMS. cmssy owns the backend - content, commerce,
auth, forms, data - and the visual block editor. **Your app owns rendering and
hosting.**

cmssy never renders or hosts your site. It stores content and serves it over a
GraphQL delivery API; your app fetches and renders it.

## The framework is an adapter, never the foundation

Everything that is not rendering - the delivery client, the config, the editor
protocol, webhook verification - lives in **`@cmssy/core`**, which imports **no
framework and no Node built-ins**. A test fails the build if that ever stops being
true.

So a Next app, an Astro app and a React Router app all talk to the same core. You
are not buying into React by choosing cmssy.

cmssy never scaffolds your app. Create it with your framework's own CLI, then
wire cmssy into it:

```bash
npx create-next-app@latest my-site   # or: npm create astro@latest / npx create-react-router@latest
cd my-site
npx @cmssy/cli init   # generates the cmssy wiring for the detected framework
npx @cmssy/cli link   # connects it to your workspace
```

## Packages

| Package                | Use it for                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@cmssy/core`          | The foundation: delivery client, config, secrets, webhooks, the editor protocol, `checkCmssyEditMode`. No framework. |
| `@cmssy/react`         | Rendering: block registry (`defineBlock`, `fields`), `CmssyServerPage`, the edit bridge, hooks.                      |
| `@cmssy/next`          | Next.js. One entry per runtime: `/server` (RSC + route handlers), `/middleware` (edge), `/client` (browser).         |
| `@cmssy/astro`         | Astro: middleware, page loader, sitemap, robots. Depends on `@cmssy/core` alone - no React, no Next.                 |
| `@cmssy/remix`         | React Router 7: loader, framing CSP, sitemap, robots.                                                                |
| `@cmssy/eslint-plugin` | Catches the crash a build cannot: a client component reaching the cmssy config.                                      |
| `@cmssy/codemod`       | `npx @cmssy/codemod v8 .` - rewrites imports across a major.                                                         |
| `@cmssy/cli`           | `cmssy init` generates the cmssy wiring into an existing app; `cmssy add block` scaffolds and registers a new block; `cmssy link` connects the app to a workspace.               |

## Documentation map

- **Getting Started** - [Quickstart](./getting-started/quickstart.md): a working headless project end to end.
- **CLI** - [`cmssy init` + `cmssy add block` + `cmssy link`](./cli.md): generate the wiring, scaffold blocks, then connect a workspace without hand-copying secrets.
- **Architecture** - [What lives where, and why](./architecture.md): the layering, and the two outages that forced it.
- **Frameworks**
  - [Next.js wiring](./wiring.md) - the complete, correct way to mount cmssy. Copy it whole.
  - [Astro](./astro.md) - the adapter that proves the core is framework-free.
  - [React Router 7 / Remix](./remix.md) - and why it needs no `/cmssy-edit` route.
- **Building Blocks**
  - [Authoring a block](./building-blocks/authoring-blocks.md) - `defineBlock`, `fields`, the component contract.
  - [Server loaders](./building-blocks/server-loaders.md) - fetch data during SSR for SEO and no loading flash.
  - [Block recipes](./building-blocks/recipes.md) - rich text, listing child pages, forms, SEO.
- **Auth** - [Member auth](./auth/member-auth.md): secure httpOnly-cookie sign-in/register/sessions.
- **Testing** - [`checkCmssyEditMode`](./testing.md): the editor is the one path a build cannot check.
- **Troubleshooting** - [Symptom → cause](./troubleshooting.md): every row cost us more than half a day.
- **Migrating** - [v8 → v9](./migrations/v8-to-v9.md) · [v7 → v8](./migrations/v7-to-v8.md) · [v4 → v5](./migrations/v4-to-v5.md) · [v3 → v4](./migrations/v3-to-v4.md)
- **Reference**
  - [API reference](./reference/sdk-api.md) - every export.
  - [Delivery API](./reference/delivery-api.md) - the public GraphQL queries you can run.

> Each guide is backed by a real, compiling example. If something here disagrees
> with the SDK's behaviour, the SDK is right - please open an issue.
