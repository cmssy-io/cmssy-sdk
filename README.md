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

| Package                | Description                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cmssy/core`          | No framework, no Node built-ins: the gateway, config, secrets, webhooks, the versioned postMessage protocol.                                                                     |
| `@cmssy/react`         | Rendering: block registry, field controls, `CmssyServerPage`, the edit bridge.                                                                                                   |
| `@cmssy/next`          | Next.js bindings, one entry per runtime: `/server`, `/middleware`, `/testing`.                                                                                                   |
| `@cmssy/remix`         | React Router 7 bindings: page loader, framing CSP. No edit route needed - a React Router page always sees its query string.                                                      |
| `@cmssy/astro`         | Astro bindings: middleware, page loader. Depends on `@cmssy/core`; `@cmssy/react` is a peer - blocks render as React islands.                                                    |
| `@cmssy/eslint-plugin` | Catches the crash a build cannot: a client component reaching the cmssy config.                                                                                                  |
| `@cmssy/codemod`       | `npx @cmssy/codemod v5 .` - rewrites imports across a major.                                                                                                                     |
| `@cmssy/cli`           | [`cmssy init`](docs/cli.md) generates the cmssy wiring; `cmssy link` connects it to a workspace; [`cmssy types`](docs/cli.md#cmssy-types-cmssycli) types the workspace's models; [`cmssy sync-manifest`](docs/cli.md#cmssy-sync-manifest-cmssycli) pushes the block and layout manifest from the build. |

## Docs

|                                                       |                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [**Architecture**](docs/architecture.md)              | What lives in which package, and why. The framework is an adapter, never the foundation.                 |
| [**Reference wiring**](docs/wiring.md)                | The complete, correct way to mount cmssy - copy it whole. The pieces depend on each other.               |
| [**Troubleshooting**](docs/troubleshooting.md)        | Symptom → cause. Every row cost us half a day, and none of them failed a build.                          |
| [**Testing**](docs/testing.md)                        | `checkCmssyEditMode` - the editor is the one path a build cannot check.                                  |
| [**API reference**](docs/reference/sdk-api.md)        | Every public export, with signatures: gateway, editor wiring, blocks.                                    |
| [**Migrating to v14**](docs/migrations/v13-to-v14.md) | Region settings are yours to declare. `CmssyLayoutSettings` is gone; `group.settings` is the JSON of your schema.     |
| [**Migrating to v13**](docs/migrations/v12-to-v13.md) | Layout regions are yours to declare. `layoutPositionValues` is gone; `position` is typed to your config. |
| [**Migrating to v12**](docs/migrations/v11-to-v12.md) | A media value is the asset's identity, not its address; read `url` off it.                               |
| [**Migrating to v11**](docs/migrations/v10-to-v11.md) | Public routes were never cached. `editMode` is now a prop, and you generate your static params.          |
| [**Migrating to v10**](docs/migrations/v9-to-v10.md)  | The SDK stopped mirroring the graph. Your queries, your SEO, your auth.                                  |
| [**Migrating to v9**](docs/migrations/v8-to-v9.md)    | The config locale override is gone. The workspace languages rule everywhere.                             |
| [**Migrating to v8**](docs/migrations/v7-to-v8.md)    | A block's content is typed by its schema. A renamed field is now a build error.                          |
| [**Migrating to v5**](docs/migrations/v4-to-v5.md)    | One command: `npx @cmssy/codemod v5 .`. The imports moved; the wiring did not.                           |
| [**Migrating to v4**](docs/migrations/v3-to-v4.md)    | The editor moved to its own route. Skip this and your preview goes blank.                                |
| [**Changelog**](CHANGELOG.md)                         | Every entry answers one question: do I have to do anything?                                              |

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

Where a layout block can live is yours to declare: `defineCmssyLayout({ regions })`
in `cmssy.config.ts` names the regions, the editor shows exactly those, and the
slot's `position` is typed to them. The header and footer are layout **blocks**, so they need a slot of their own -
one that fetches with the preview secret in edit mode and renders through the
edit bridge. On Next that slot is `CmssyLayoutSlot` from `@cmssy/next/server`,
and `cmssy init` mounts it for you; the client half it renders in edit mode
(`EditableLayout`) is your app's, because the block registry has to be imported
lazily in the browser. Astro and React Router build the slot from
`resolveCmssyLayoutSlot` in `@cmssy/react` - `cmssy init` scaffolds that file
too. [wiring §5](docs/wiring.md) explains the three things it has to get right.

Full version, with the reasons: [docs/wiring.md](docs/wiring.md).

## What the SDK does, and what it does not

Since 10.0 the SDK is three things: a **gateway** to the delivery API, the
**editor/preview wiring**, and **block authoring**. Anything expressible as a
GraphQL query is your app's query - so SEO, member auth, cart and checkout are
code you own, in your repo, typed against the schema.

```ts
// services/seo.ts - your metadata, over the SDK's gateway
const data = await graphqlRequest(
  cmssy,
  PAGE_META_QUERY,
  { workspaceSlug: cmssy.workspaceSlug, slug },
  { public: true, retry: {} }, // retry is off by default: this also carries mutations
);
```

Two apps show the whole shape, and both build against the published packages:

- [**simple-blog**](https://github.com/cmssy-io/examples/tree/main/simple-blog) - the
  minimal site: four blocks, typed queries (`graphql/` → codegen → `services/`),
  metadata, sitemap, robots, the layout slot.
- [**next-storefront**](https://github.com/cmssy-io/examples/tree/main/next-storefront) - the same plus a
  storefront: sessions, cart and checkout as Server Actions.

Coming from v9? [Migrating to v10](docs/migrations/v9-to-v10.md) lists every
removed symbol next to what replaces it, and the three things that break
silently when you write the replacement yourself.

## Status

Published on npm. `@cmssy/{core,react,next,astro,remix}` release in lockstep -
install them at the same version.
