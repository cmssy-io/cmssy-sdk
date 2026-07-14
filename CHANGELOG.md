# Changelog

Every entry answers one question: **do I have to do anything?**

A breaking change without a migration note is not a release - it is a trap. Two
consumers shipped a dead editor because 4.0.0 moved the edit path and said so
nowhere.

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

**Do I have to do anything?** If you import only from `@cmssy/next` and
`@cmssy/react`, no - both still re-export what they always did. If you imported
data helpers deeper, point them at `@cmssy/core`. See
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
