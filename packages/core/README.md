# @cmssy/core

Framework-agnostic client for a [cmssy](https://cmssy.com) headless site. Builds
the delivery request, defines blocks and layouts, resolves media and locales, and
verifies webhooks. Everything the framework packages are built on.

```bash
pnpm add @cmssy/core
```

Most sites do not install this directly. Use
[`@cmssy/next`](https://www.npmjs.com/package/@cmssy/next) with
[`@cmssy/react`](https://www.npmjs.com/package/@cmssy/react), or
[`@cmssy/astro`](https://www.npmjs.com/package/@cmssy/astro) /
[`@cmssy/remix`](https://www.npmjs.com/package/@cmssy/remix), which pull this in.
Reach for `@cmssy/core` when you are wiring a framework we do not ship bindings
for.

## Configure once

```ts
import { defineCmssyConfig, createCmssyClient } from "@cmssy/core";

export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
});

export const client = createCmssyClient(cmssy);
```

`defineCmssyConfig` validates the required values and throws if one is missing.
Do not paper over a missing org or workspace slug with `?? ""` - an empty
segment builds a delivery URL like `/public//graphql` that fails far from the
cause.

## What is in the box

`defineCmssyConfig`, `createCmssyClient`, `graphqlRequest` for the transport;
`fields` and `defineCmssyLayout` for block and layout definitions; `mediaUrl`,
`mediaUrls`, `mediaAlt` for media; `localizeHref`, `resolveCmssyLocale`,
`CMSSY_LOCALE_HEADER` for i18n; `applyCmssyCsp` and `verifyCmssyWebhook` for the
edges. Full signatures in
[docs/reference/sdk-api.md](https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/reference/sdk-api.md).

## Versioning: this package, not the API

**Pinning this package does not pin the API it talks to.** They are two separate
things and only one of them is in your lockfile.

- The **package version** covers this client: its exports, their signatures, its
  behaviour. Normal semver - a major means your code may need changing.
- The **delivery API** is a hosted service. Its GraphQL schema can change on any
  deploy, and it does so without a release here. A field removed from the schema
  is gone for `@cmssy/core@16.9.0` exactly as it is for the next version.

So `"@cmssy/core": "16.9.0"` in your `package.json` is not a compatibility
guarantee against the server, and there is currently no API version you can pin
instead - the delivery endpoint has no version segment.

What protects you today:

- Every change to the schema runs against this SDK's own operations in CI before
  it can merge, so the queries shipped here keep working.
- A breaking change cannot merge silently. It fails the gate, and shipping one
  anyway requires an explicit, recorded approval.
- Fields we intend to remove are marked `@deprecated` in the schema first, which
  shows up in your codegen output and your editor.

What does not exist yet, stated plainly rather than implied: there is no
guaranteed deprecation window, no minimum notice period, and no dated API
version to pin. If your own documents select fields beyond what this package
queries, validate them against the live schema in your own CI.

## License

MIT
