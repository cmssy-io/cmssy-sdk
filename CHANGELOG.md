# Changelog

Every entry answers one question: **do I have to do anything?**

A breaking change without a migration note is not a release - it is a trap. Two
consumers shipped a dead editor because 4.0.0 moved the edit path and said so
nowhere.

## 9.0.0

**The config locale override is gone.** `CmssyConfig.defaultLocale` and
`CmssyConfig.enabledLocales` duplicated the workspace site config and were
honored inconsistently: the sitemap, `buildCmssyMetadata` and the Next locale
middleware read them, the page router never did. Set `defaultLocale: "en"` in
a `pl`-default workspace and the sitemap disagreed with the routing - silently.
The workspace (Settings → Languages) is the only source of truth now.

```bash
npx @cmssy/codemod v9 .
```

The codemod strips the two keys from your config literal and reports each
removal. If the removed value disagreed with the workspace, fix the workspace
languages - everything follows them now. `resolveLocale` is unchanged. See
[the migration guide](docs/migrations/v8-to-v9.md).

New in `@cmssy/core`: `localesFromSiteConfig(siteConfig)` - the one mapper
from a workspace site config to `{ defaultLocale, locales }`; the router and
the SEO helpers both go through it, so they can no longer disagree.
`resolveSeoLocales` (config-aware) is removed.

## 8.0.0

**A block's `content` is typed by its field schema.** Until now the schema and
the component's content type were two independent sources of truth, kept in sync
by hand. Rename a field in one and forget the other, and TypeScript said nothing:
the block rendered **empty**, in the editor and in production.

```ts
props: {
  headline: fields.text({ required: true });
} // schema
interface HeroContent {
  heading?: string;
} // component - drifted
// tsc --noEmit → exit 0. The block renders nothing.
```

Fields now carry the type of the value they hold, and `defineBlock` derives the
component's content from `props`. The schema is the only place a field is named.

```bash
npx @cmssy/codemod v8 .
```

The codemod removes the type arguments `defineBlock` no longer needs and **names
every block you must retype by hand** - it will not rewrite a hand-written
content type, because that type is the thing that drifted, and copying it forward
would launder the bug.

```tsx
export const heroProps = { heading: fields.text({ required: true }) };

export default function Hero({ content }: BlockProps<typeof heroProps>) {
  return <h1>{content.heading}</h1>; // string, not string | undefined
}
```

Also: a `select` narrows to its own options, `media` to `string` or `string[]` by
`multiple`, a `repeater` to the shape of one row. Phantom types only - the
emitted JavaScript is unchanged. Full guide:
[v7 → v8](docs/migrations/v7-to-v8.md).

## 7.0.0

**`CmssyChrome` → `CmssyLayoutSlot`.** "Chrome" is UI jargon for the frame around
the content. In a CMS SDK it reads as the browser, and the thing it actually
renders is a **layout slot**: the header or footer blocks at a named position.

```bash
npx @cmssy/codemod v7 .
```

**The localized editor check no longer needs a word from your copy.**

```diff
- localizedMarker: "Handlekurv",   // breaks the day an editor rewrites the copy
+ // nothing: the check reads <html lang>, which is a contract
```

`checkCmssyEditMode` now proves the localized preview renders in the right
language by reading `<html lang>` rather than searching for a word only that
language says. A word in the page's copy is content - an editor can change it at
any time, and then the test lies. `localizedMarker` is gone; pass
`localizedLocale` if the language is not the first path segment.

## 6.2.0

**`@cmssy/remix` - React Router 7.** And a smoke test that stops lying.

The Remix adapter needs **no `/cmssy-edit` route**: that route exists because a
Next page can be static, and a static page never sees the query string. React
Router renders on every request, so the editor is served from the page itself -
verified the same way, on the same protocol.

**The editor smoke test was passing for the wrong reason.** It looked for
`CmssyEditor` or `cmssy-edit` in the HTML - a chunk name and a route path. Those
are bundler artifacts, not a contract: they happened to appear in Next and Astro
output, and appeared nowhere in React Router's, so a working editor reported as
broken.

The edit bridge now renders an explicit `data-cmssy-editor` marker, and the smoke
test looks for **that**. All three starters (next, astro, remix) pass against it -
on a real production build, against a real workspace.

**Do I have to do anything?** No, unless you wrote your own editor bridge without
`CmssyLazyEditor` / `CmssyEditablePage` - then render the marker yourself.

## 6.1.0

**`create-cmssy-app --framework next|astro`.**

An adapter with no starter rots: nobody runs it, so nobody notices the day it
stops working. Both frameworks now generate a complete, wired app - the edit
route, the middleware carrying the locale and the edit flag, the chrome on the
edit bridge, sitemap, robots, and `pnpm smoke:edit`.

And CI generates **both** starters on every push, builds them, starts them, and
asks the running site whether its editor works. We shipped a dead editor twice
with every build green (CMS-969, CMS-970); this is the check that would have
caught it.

Without the workspace secrets the smoke step **says so** rather than passing
quietly - a green check that verifies nothing is worse than no check.

## 6.0.0

**`@cmssy/core` no longer imports Node.**

It said it ran anywhere. It did not: webhook verification used node's `crypto`,
so the moment an Astro island pulled `@cmssy/core` into a browser bundle, the
build died on `"timingSafeEqual" is not exported by __vite-browser-external`.

Nobody hit it before because every consumer was Next, where core never reached
the client. The first non-Next adapter found it on day one - which is exactly why
the adapter exists.

Webhook verification now uses **Web Crypto**, like the secret comparison already
did. It works in Node, on the edge, in a browser and in a Vue app.

**Do I have to do anything?** Only if you verify webhooks - it is async now:

```diff
- const event = verifyCmssyWebhook({ body, signatureHeader, secret });
+ const event = await verifyCmssyWebhook({ body, signatureHeader, secret });
```

The boundary test in core now fails the build on **any** Node built-in, not just
on React and Next. A built-in is a framework too - the framework of one runtime.

## 5.1.0

**`@cmssy/astro` - the first adapter that is not Next.**

`@cmssy/core` was extracted so that any framework could talk to cmssy. Until a
second adapter existed, that was a claim. Now it is a test: `@cmssy/astro`
depends on `@cmssy/core` alone, and its suite **fails the build if any file in it
imports React or Next**.

```ts
// src/middleware.ts - the whole adapter
import { cmssyMiddleware } from "@cmssy/astro";
import { cmssy } from "./cmssy.config";

export const onRequest = cmssyMiddleware(cmssy);
```

It resolves the language, routes a verified editor request to `/cmssy-edit`, and
applies the CSP that lets the admin frame the site - the same sequence the Next
proxy uses, because it is the same protocol, not a Next protocol.

Also: `loadCmssyPage`, `createCmssySitemap`, `createCmssyRobots`, and
`@cmssy/astro/testing` re-exporting the same editor smoke test. See
[docs/astro.md](docs/astro.md).

**Do I have to do anything?** No - nothing in 5.0 changed.

## 5.0.0

**`@cmssy/core` - cmssy stops requiring React.**

The data layer never needed React, and the config, CSP, session, cart, webhook
and smoke-test code never needed Next. They just happened to be written there.
The cost was not cosmetic: **a Vue, Svelte or Astro app had to install React to
fetch a page.**

They now live in `@cmssy/core`, which imports no framework at all - and a test
fails the build if that ever stops being true.

```
@cmssy/core     transport, queries, config, editor protocol, secrets, webhooks
@cmssy/react    rendering: blocks, components, edit bridge, hooks
@cmssy/next     Next only: middleware, route handlers, Metadata, sitemap/robots
```

**`@cmssy/next` now says which runtime each export belongs to.**

The package spans three worlds that cannot share code: middleware runs on the
edge, pages and route handlers run on the server, components run in the browser.
They used to share one entry, which is why `server-only` could not be placed
anywhere without breaking someone (and did - reverted in 4.6.2).

```ts
import { defineCmssyConfig } from "@cmssy/next"; // safe everywhere
import { createCmssyProxy } from "@cmssy/next/middleware"; // edge
import { createCmssyPage, CmssyChrome } from "@cmssy/next/server"; // RSC + routes
import { CmssyLink } from "@cmssy/next/client"; // browser
```

`@cmssy/next/server` now carries `server-only`, for real: the bundles are
checked, and a test walks the import graph of every entry so middleware can
never reach `next/headers` again. **`@cmssy/next/preset` is gone** -
`createCmssyProxy` moved to `/middleware`, `CmssyChrome` to `/server`.

**New: `@cmssy/eslint-plugin`.** `server-only` cannot catch the crash we
actually shipped (CMS-968), because the chain ran through the consumer's own
files: a client component imported `lib/locale.ts`, which imported
`cmssy.config`. The rule follows that chain and names it:

```
editor.tsx -> lib/locale.ts -> cmssy.config.ts
```

It is on by default in `create-cmssy-app`.

**Do I have to do anything?** Yes - the import paths moved. If you import only
from `@cmssy/next` and `@cmssy/react`, the data helpers still re-export from
there; what changed is which entry the Next bindings live behind. See
[docs/architecture.md](docs/architecture.md).

Two renames, because the names had become lies:

- `CmssyNextConfig` → `CmssyConfig` (nothing about it is Next's).
- `clearCartWorkspaceIdCache` → `clearWorkspaceIdCache` - there were **three**
  copies of the same workspace-id cache, two sharing a name. There is now one.

`fetchProducts` / `fetchProduct` behave exactly as before **when imported from
`@cmssy/next`** (they still pick up the request's language). Imported from
`@cmssy/core` they take the locale you pass and nothing else - core does not
know what a request is.

## 4.7.0

**`@cmssy/next/preset` - the whole wiring, in three lines.**

```ts
// proxy.ts
export const proxy = createCmssyProxy(cmssy, { stripLocalePrefix: true });
export const config = { matcher: cmssyProxyMatcher };
```

```tsx
// layout.tsx
<CmssyChrome
  config={cmssy}
  blocks={blocks}
  position="header"
  editable={EditableLayout}
/>
```

`CmssyChrome` renders the site chrome server-side for visitors and through the
edit bridge (with the draft, behind the preview secret) in the editor. Nothing is
removed - the pieces are still exported for apps that need something unusual.

## 4.6.2

The config, when it ends up in the browser, now says what actually happened: a
client component imported a **value** from a module that reads it. The old
message ("set these env vars") sent you to fix something that was already right.

## 4.6.0

In dev, the middleware probes the edit route once and tells you when nothing is
mounted at `/cmssy-edit` - the mistake that killed two editors while every build
stayed green.

## 4.5.0

**The SDK stopped guessing at English.** `CmssyServerLayout`, `CmssyServerPage`
and `createCmssyPage` fell back to `"en"`; they now ask the workspace for its
default language (cached). A Norwegian-first workspace was getting an English
header under a Norwegian page - and `createCmssyPage` would have treated `no` as
a non-default language and prefixed every URL with it.

**Do I have to do anything?** No. Pass `config` to `CmssyServerLayout` /
`CmssyServerPage` if you render them directly and do not pass `locale`.

## 4.4.0

`@cmssy/next/testing` → `checkCmssyEditMode`, a smoke test for the path a build
cannot check: a site whose editor is dead still compiles and serves. Run it
against a started production build; see `docs/testing.md`.

## 4.3.0

`cmssyEditRewrite` forwards request headers (`{ requestHeaders }`), so a site that
resolves the language in middleware does not lose it on the way to the editor.

## 4.2.0

`createCmssySitemap`'s `extra` accepts a resolver, so URLs that come from model
records (a shop's products) can join the sitemap with the same base URL and
locales the page entries use.

## 4.1.0

**SEO: the page language is read from the URL.** `buildCmssyMetadata` took the
language from `config.resolveLocale` and its docs told you to strip the locale
prefix first. A consumer that never set `resolveLocale` served **every translated
page the default language's title - and a canonical pointing at the default
language's URL**, which tells Google the translation is a duplicate.

**Do I have to do anything?** **Yes.** Pass the path **as routed**, prefix and
all:

```diff
- const { path: stripped } = await splitCmssyLocale(cmssy, path);
- return buildCmssyMetadata(cmssy, stripped);
+ return buildCmssyMetadata(cmssy, path);
```

The sitemap now also emits one entry per language version (not just the default
one) and declares `x-default`.

## 4.0.0 - BREAKING

**The editor renders on its own route.** A verified `cmssyEdit=1` + `cmssySecret`
request is rewritten to `/cmssy-edit/...`, so the public pages can stay static -
a static page never sees the query string that would put it in edit mode.

**Do I have to do anything?** **Yes, or your editor preview goes blank.** See
[docs/migrations/v3-to-v4.md](docs/migrations/v3-to-v4.md).

## 3.0.0 - BREAKING

`isCmssyEditRequest` became async and takes the config:

```diff
- const editMode = isCmssyEditRequest(request);
+ const editMode = await isCmssyEditRequest(request, cmssy);
```

Miss the `await` and the Promise is truthy - **the whole site renders in edit
mode**.
