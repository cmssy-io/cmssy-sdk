# Architecture: what lives where, and why

cmssy is a headless CMS. If talking to it requires React, it is not headless -
it is a React CMS with a REST endpoint. So the rule is one sentence:

> **The framework is an adapter, never the foundation.**

## The layers

```
@cmssy/core     transport, queries, config, editor protocol, secrets, webhooks.
                Zero framework. Runs in Node, edge, a browser, a Vue app, a
                cron job, a test.
      ↑
@cmssy/react    rendering: block registry, components, the edit bridge, hooks.
      ↑
@cmssy/next     Next.js bindings only: middleware, route handlers, Metadata,
                sitemap/robots, next/headers, page factories.
```

Adapters (`@cmssy/vue`, `@cmssy/nuxt`, `@cmssy/remix`, `@cmssy/astro`) sit at the
same level as `react` / `next`. None of them may be a dependency of another.

## How to decide where a module goes

Ask what it actually touches:

| It touches…                                              | It belongs in |
| -------------------------------------------------------- | ------------- |
| HTTP, GraphQL, strings, crypto, dates, the edit protocol | `core`        |
| JSX, hooks, a component tree                             | `react`       |
| `next/headers`, `NextResponse`, `Metadata`, App Router   | `next`        |

A useful test: **could a Vue app want this?** A cart client, a webhook
verifier, a locale-from-path helper, an editor smoke test - yes, all of them.
Then they cannot live in a React or Next package, no matter who wrote them
first.

## The mistake this structure exists to prevent

Before 5.0.0 the data layer lived in `@cmssy/react` and the config, CSP, session,
webhook and cart clients lived in `@cmssy/next`. Nothing was wrong with the code

- it was in the wrong box. Two things followed:

1. **A Vue or Astro app had to install React to fetch a page.** So "headless for
   any frontend" was marketing, not a fact.
2. **The `server-only` guard could not be placed honestly.** One package mixed
   edge, RSC, client and pure code, so any boundary drawn inside it broke
   someone - and it did: shipping `server-only` on the entry broke consumers'
   middleware, and we had to revert it in 4.6.2.

Structure was the fix. The guard became a consequence of it, not a workaround.

## The rule is enforced, not documented

`packages/core/src/__tests__/framework-boundary.test.ts` fails if **any** file in
core imports `react`, `react-dom`, `next`, `vue` or `svelte`.

Documentation decays; a red test does not. Add a React import to core and CI
tells you the name of the file you broke it in.

## The editor protocol is shared on purpose

`bridge/protocol` and `bridge/messages` are in core, not in `@cmssy/react`,
because the editor talks to the site over `postMessage` - not over React. The
Vue bridge speaks the same protocol, or the protocol was never a protocol.
