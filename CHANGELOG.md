# Changelog

Every entry answers one question: **do I have to do anything?**

A breaking change without a migration note is not a release - it is a trap. Two
consumers shipped a dead editor because 4.0.0 moved the edit path and said so
nowhere.

## 12.14.2

**The same fix as 12.14.1, one level up: `cmssy init`'s Astro and Remix
scaffolds rendered *layout* blocks with neither `data` nor `resolvedContent`.**
A header or footer block with a loader or a relation field looked right in the
editor and wrong on the live site - the edit branch of the generated
`cmssy/layout-slot.tsx` passed both halves, the public branch passed neither.
Next apps were never affected: `CmssyServerLayout` resolves per block itself.

Both scaffolds now resolve the layout positions where `await` is already
available - the Astro frontmatter and the Remix loader - with
`resolveEditorLayoutBlockData`, which has been public API of `@cmssy/react` all
along. Nothing in `@cmssy/react`, `@cmssy/astro`, `@cmssy/remix` or
`@cmssy/next` changed.

**Do I have to do anything?** Nothing if you scaffold with 12.14.2 or later,
nothing for a Next app, and nothing if your header and footer blocks read only
plain fields. A site scaffolded earlier that puts a loader or a relation in a
layout block keeps rendering it unresolved until you copy the fix in:

- `cmssy/layout-slot.tsx`: the public branch passes
  `data={data?.[block.id]}` and `resolvedContent={resolvedContent?.[block.id]}`
  to `CmssyBlock`.
- Astro `src/pages/[...path].astro`: call `resolveEditorLayoutBlockData` for
  each position and pass the result into that position's `LayoutSlot`.
- Remix `app/routes/page.tsx`: resolve both positions in the loader on the
  public path, keep using the adapter's `editorData` on the edit path, and read
  one map in the component.

Scaffold a throwaway app with the new CLI and diff those files against yours.

## 12.14.1

**`cmssy init` scaffolded an Astro or Remix site whose blocks never got their
resolved content.** The generated page rendered `<CmssyBlock>` with neither
`data` nor `resolvedContent`, so every block fell back to the raw stored
bucket. Three things silently did not happen: no block loader ran, so `data`
was always `undefined`; `resolveRelationContent` never ran, so a
`fields.relation` or `fields.pageSelector` reached the component as the bare id
string it is stored as, not the record its type promises; and
`normalizeBlockContent` was skipped, because `CmssyBlock` only normalizes when
it was handed a schema. Nothing threw. The page rendered, with the wrong
content.

The Next scaffold was never affected - `CmssyServerLayout` resolves for it.

Both scaffolds now call `resolveEditorBlockData` and pass **both** halves of
what it returns. `{ data, content }` are different things: `data` is the
loaders' output, `content` is the resolved content. Taking only `.data` is the
same bug wearing a different shape.

**Do I have to do anything?** Nothing if you scaffold with 12.14.1 or later,
and nothing for a Next app. A site scaffolded with 12.14.0 or earlier keeps
rendering unresolved content until you copy the fix in - `cmssy init` writes
these files once and never touches them again:

- Astro: `src/pages/[...path].astro` destructures `const { data: blockData,
  content: blockContent } = await resolveEditorBlockData({...})` and passes
  `blockContent` into `src/components/Blocks.tsx`, which sets both
  `data={blockData[block.id]}` and `resolvedContent={blockContent[block.id]}`.
- Remix: `app/routes/page.tsx` wraps `createCmssyLoader` so the loader returns
  `blockData` and `blockContent`, and the component passes both down.

Scaffold a throwaway app with the new CLI and diff those files against yours.

## 12.14.0

**`no-server-config-in-client` no longer needs you to have called
`defineCmssyConfig`.** The rule decided a module was "the config" by finding
that call or an import of `@cmssy/next/server`. An app that builds the object
itself - importing the type, calling nothing - matched neither, so the rule
walked its imports, found nothing, and reported nothing. Measured on a live
consumer: a `"use client"` component importing `{ cmssy }` from its config
linted clean, with every value in that object `""` in the browser.

A `CMSSY_*` variable is server-only by construction, because the bundler inlines
`NEXT_PUBLIC_*` and nothing else. Reading one is now what marks a module as the
config, whatever the module calls:

```ts
// reported from a client component from 12.14.0 - it was silent before
export const cmssy: CmssyConfig = {
  org: process.env.CMSSY_ORG_SLUG ?? "",
  draftSecret: process.env.CMSSY_DRAFT_SECRET ?? "",
};
```

The same read **inside** a client component is reported too, on the read itself:
it evaluates to `undefined` in the browser, and a draft secret must never be a
`NEXT_PUBLIC_` name to make it work.

**Do I have to do anything?** Lint may now fail where it passed, and every hit is
a value that is empty or `undefined` in the browser today. Import the type
instead of the value, or move the read into a server component and pass the
result down as a prop. `NEXT_PUBLIC_CMSSY_*` reads are untouched.

## 12.13.0

**`cmssy init` wires the lint rules into your eslint config.** The two rules
that catch what a build cannot - server config pulled into a client bundle, and
a provider mounted on the public root but not on `/cmssy-edit` - were opt-in.
`init` wrote no eslint config and added no plugin, so the only static detector
for a blank editor preview reached you if you read `wiring.md`.

`init` now adds `@cmssy/eslint-plugin` to `devDependencies` and appends
`...cmssy.configs.recommended` to the default export of your flat config - an
array literal, a named const, `defineConfig([...])`, or a variadic builder like
`tseslint.config(...)`. An app that lints but has no config of its own gets an
`eslint.config.mjs`. Your config is never overwritten, not even with `--force`,
and a second run changes nothing. What it cannot edit - a legacy `.eslintrc`, a
CommonJS config, a config with no default export - is printed with the lines to
paste.

**New: `cmssy.configs.standalone`.** `configs.recommended` declares no `files`
and no parser, so it inherits whatever your config already lints. In a config
that is *only* cmssy rules that means it fires nowhere: eslint lints `.js` by
default and skips every `.tsx` layout the parity rule is about. `standalone` is
that preset plus the TypeScript parser, the ts/tsx patterns, and the build
directories eslint does not ignore on its own. It is what `init` writes.

Nothing to do on an existing app. Rerun `npx @cmssy/cli init` in one to have
the rules wired for you - it skips every file it already wrote and only
touches the eslint config. `@typescript-eslint/parser` is now a dependency of
`@cmssy/eslint-plugin` rather than a dev one, because a preset that ships a
parser has to bring it.

## 12.12.0

**`nextRetryMode()` is exported.** 12.11.0 taught the Next adapter to tell a
build from a visitor, but kept the check to itself. An app that queries the
delivery API through its own gateway - one `publicRequest` feeding
`generateStaticParams`, `generateMetadata` and a dynamic route - had no way to
ask the same question, so it had to hardcode a mode that is wrong half the time
or reimplement the env check by hand.

```ts
import { nextRetryMode } from "@cmssy/next";

graphqlRequest(cmssy, query, variables, {
  public: true,
  retry: nextRetryMode(),
});
```

Nothing to do if you only use `createCmssyPage` / `CmssyLayoutSlot` - they
already called it internally. `NEXT_BUILD_PHASE` is exported alongside it.

## 12.11.0

**Retry now knows whether a build or a visitor is waiting.** Until now there was
one default for two opposite situations. A build should wait out a
`Retry-After: 45` - a page arriving 45s late is cheaper than a failed deploy. A
visitor should not: holding their request open for 45s to maybe avoid an error
page is the worse outcome. Both got the build's answer.

`retry` now takes a mode as well as a policy:

```ts
retry?: "build" | "interactive" | RetryPolicy | false;
```

|                             | `build` | `interactive` |
| --------------------------- | ------- | ------------- |
| retries                     | 4       | 2             |
| honours `Retry-After` up to | 60s     | 1s            |
| total waiting               | 180s    | 2s            |

**You should not have to pick.** Each adapter defaults to the mode that matches
its call site:

- `createCmssyPage` and `CmssyLayoutSlot` read `process.env.NEXT_PHASE` - `build`
  during `next build`, `interactive` when the same code serves a dynamic route.
  Nothing to configure.
- `createCmssyLoader` (Remix) defaults to `interactive`, because a loader runs per
  request. Prerendering with React Router 7? Pass `retry: "build"`.
- `loadCmssyPage` (Astro) reads a new `prerendered` option. Pass
  `prerendered: Astro.isPrerendered` and it picks correctly; omit it and you get
  `build`, which is Astro's own default output.

**What to check:** if you render on demand, a sustained 429 now surfaces as an
error in seconds instead of a request that hangs for a minute. That is the point
of the change, but it is a behaviour change - if you would rather keep waiting,
pass `retry: "build"` explicitly.

Three things the modes needed in order to mean anything, all available on a
`RetryPolicy` of your own:

- **`maxTotalWaitMs`** - a wall-clock budget across all attempts, not just per
  attempt. When it runs out the call surrenders and `CmssyRequestError.waitedMs`
  tells you how long it spent.
- **`throttleBaseDelayMs`** - a 429 is not a 503. A transient error resolves in
  milliseconds; a throttle needs the rate-limit window to roll over. They now get
  different base delays.
- **Full jitter** on the backoff, plus a bounded spread on a honoured
  `Retry-After`. The delivery API answers the same window-aligned value to every
  caller, so without it parallel workers wake in the same millisecond and
  re-throttle each other.

Every scheduled retry is now logged with its label and attempt number. A build
that suddenly takes minutes instead of seconds says why in its own log.

## 12.10.0

**Retry is no longer a Next-only option.** 12.9.0 gave `createCmssyPage` a
`retry` policy and left the other adapters without one - so an Astro or Remix
site had no way to raise the ceiling, cap the wait, or turn retries off. It also
missed the layout fetch, which every adapter makes on every page, Next included.

`loadCmssyPage` (Astro), `createCmssyLoader` (Remix), `CmssyLayoutSlot` (Next)
and `resolveCmssyLayoutSlot` (React) all take the same option now, with the same
default:

```ts
export const loader = createCmssyLoader(cmssy, {
  blocks,
  retry: { maxRetries: 5, maxRetryAfterMs: 120_000 },
});
```

Nothing to do - the default is what these calls already did. Pass `retry: false`
to fail on the first 429 instead, which is usually what you want in a
request-time loader: a visitor waiting a minute is worse than an error page.

One number to budget: `maxRetries * maxRetryAfterMs` bounds how long a **single**
call sleeps between attempts. The requests themselves land on top, and a page
makes several calls - so a static build's per-page timeout has to sit above the
sum, not equal to the sleep budget.

## 12.9.0

**A 429 during a build no longer fails the page.** The delivery API rate-limits
per minute and answers `Retry-After` in seconds - typically 20-60 during a cold
build that renders many pages at once. The SDK gave up on anything above 10s, so
every one of those became `cmssy: page fetch failed (429)` and took the build
down. The ceiling is now 60s, the window the backend actually enforces, exported
as `CMSSY_RATE_LIMIT_WINDOW_MS` for anyone who wants to reason about it. Nothing
to do - rebuild on 12.9.0.

**`createCmssyPage` now retries its own queries.** The page renderer makes four
delivery calls (site locales, workspace id, the page, its forms) and only the
page one had a retry policy; the other three surrendered on the first 429. All
four now share one policy, and you can set it:

```ts
export default createCmssyPage(config, blocks, {
  retry: { maxRetries: 5, maxRetryAfterMs: 90_000 },
});
```

Pass `retry: false` to turn retries off entirely. This covers the page's own reads
and nothing else. Mutations are unchanged: `graphqlRequest` still defaults to no
retry, because retrying a write on a 429 can duplicate it. If you hand a mutation
call a policy of your own it will retry - do that only for a write you know is
idempotent.

## 12.8.0

**A provider the editor never gets is now a lint error.**
`edit-route-provider-parity` ships in `@cmssy/eslint-plugin`'s `recommended`
config as an error. It fires when `app/[[...path]]/layout.tsx` wraps `{children}`
in something that looks like a provider and `app/cmssy-edit/[[...path]]/layout.tsx`
does not - the state that renders an editor preview without whatever that provider
gave the page. A missing animation provider is the loudest case: `whileInView`
never attaches and every reveal sits at `opacity: 0`, so the preview looks blank
with no error anywhere.

**The scaffold now writes `cmssy/site-providers.tsx`** and renders it from both
roots, so there is one place a provider can go and reach both. Existing apps keep
whatever they have; `cmssy init` skips files that already exist.

**The preview learns it was resized.** The editor's device toggle resizes the
iframe with CSS, which changes the child's `innerWidth` and fires no `resize`
event. The bridge now replays the editor's `cmssy:viewport` report as a real
`window` resize, so responsive hooks, `matchMedia` re-reads and animation setups
run on a device switch like they do in a browser. Needs the admin side, live on
cmssy.io.

**Do I have to do anything?** If you use the `recommended` eslint config and a
provider lives only in the public root layout, lint now fails - move it into
`cmssy/site-providers.tsx` and render that from both roots
([wiring §4](docs/wiring.md)), or repeat the provider in the edit layout.
Nothing else needs a change.

## 11.7.0

**The docs said things the code does not.** A file-by-file pass found eighteen,
and the two that would have cost you an afternoon are both in
[the delivery API reference](docs/reference/delivery-api.md): the "list child
pages" example called a flat root field `publicPagesByType`, which the schema does
not have (it is `public.page.byType`), and the wrapped-operations table named five
more flat fields that were namespaced away. Also corrected: `MODEL_RECORDS_QUERY`
and `MODEL_DEFINITIONS_QUERY` come from `@cmssy/core/internal`, not
`@cmssy/react`; the README no longer says `CmssyLayoutSlot` was removed in 10.0,
because it is exported from `@cmssy/next/server` and `cmssy init` mounts it; and
`@cmssy/astro` needs `@cmssy/react` as a peer, so "no React" was half true at
best. The full list is in the pull request.

**`@cmssy/core/internal` lost eight symbols** nothing imported and no doc
mentioned: `normalizeSlug`, `resolvePublicUrl`, `cachedWorkspaceId`,
`localesFromSiteConfig`, `buildLocaleSwitchHref`, `localizeHtmlLinks`,
`RECORDS_BY_IDS_QUERY`, `CmssyDeliveryOperation`. If you imported one from
`/internal`, it moved nowhere - that entry point is the adapters' and never
promised a shape. Say so and it can come back to the public surface with a name.

**`checkCmssyEditMode` talks to your app and nothing else.** The `workspace`
option queried a workspace's delivery API to find out whether the site has
layout blocks, so the check's coverage depended on content the caller had
already told it about by other means. 11.5.1 removed the same pattern for
language and left this one. It is now `expectLayoutBlocks: boolean` - the caller
states the fact, the check needs no API token, no org and no workspace slug, and
it cannot go red because someone deactivated a header.

**Do I have to do anything?** Replace `workspace: { org, workspaceSlug }` with
`expectLayoutBlocks: true`. Nothing else in the check changed. Callers that never
passed `workspace` are unaffected.

**`EditSmokeResult` gained `skipped: string[]`.** An empty `failures` answered
"did anything fail", never "was anything checked" - and four of the six
assertions only run when the call gives them something to run against. They now
say so by name, so a run that checks half of what you think it checks cannot
report an unqualified green. Print it in CI.

**Comments are gone from the SDK's source.** ~1270 lines of them across 103
files, some of them wrong: `edit-smoke.ts` claimed `data-cmssy-unknown-block`
counted toward the server-rendered layout assertion, which was true for 38
minutes on 27 July and never again. The behaviour is unchanged - the rationale
belongs in `docs/` and in commit messages, where it cannot silently contradict
the code beside it.

**`cmssy init` explains itself as it writes.** The scaffolded files carried their
explanations as comments; those print now - one line per file, plus the handful of
things whose absence breaks the editor silently - and the files land clean in your
repo.

**CommonJS consumers were getting the wrong types.** Every package shipped one
`types` condition per subpath, pointing at the ESM declarations, so a
`require("@cmssy/core")` from TypeScript resolved types that describe an ES module

- what `@arethetypeswrong/cli` calls masquerading. `tsup` was already emitting the
  `.d.cts` files; the exports map never pointed at them. All 19 subpaths across the
  eight packages now declare `types` per condition. `import` users see no change.

**Do I have to do anything?** No - unless you `require()` the SDK from
TypeScript, in which case this is the fix. `publint --strict` and `attw` run in CI
from now on, and each package's published subpaths are snapshotted, so one cannot
disappear quietly either.

**The Fakturownia invoicing example is gone** - deleted, not moved. It was a
README and one webhook route that nothing here built, typechecked or tested, and
an example living in this repo can only ever demonstrate an unreleased `main`.
Examples that run against published packages live in `cmssy-io/examples`.

## 11.6.0

**`verifyCmssyWebhook` now accepts several secrets.** `secret` takes
`string | readonly string[]`, and the verifier reads **every** `v1=` part of the
signature header instead of only the last one. A delivery verifies when any
signature matches any secret. Nothing to do: a single secret behaves exactly as
before, and cmssy still sends one signature today.

This exists for secret rotation. Rotating is a hard cutover right now - the old
secret stops verifying the instant the new one is issued, so deliveries fail
until you redeploy. Once cmssy signs with the previous secret as well, holding
both across a deploy will make rotation seamless. Upgrade before that ships.

**A non-string secret is now rejected.** Passing `[{ id, value }]` where
`[value]` was meant used to stringify the object into the HMAC key - so the
endpoint's effective key became the guessable literal `"[object Object]"` and a
forged delivery verified. It throws `CmssyWebhookError` instead. Untyped
callers should check what they pass.

**A missing secret throws `CmssyWebhookError`, not `TypeError`.** `undefined`
or `null` now fails as a webhook error like every other failure, so a handler
that maps `CmssyWebhookError` to 401 keeps doing so when an env var is unset.

## 11.5.1

**`checkCmssyEditMode` no longer asks a workspace which language to assert.**
11.5.0 derived `localizedPath` by querying the delivery API for a workspace's
enabled languages. That traded a hardcoded locale for a worse coupling: the
check's coverage came to depend on content nobody in this repo owns.
`localizedPath` is caller-supplied again, as before 11.5.0 - only the caller
knows how its site spells a language.

**The starter-smoke and examples workflows are gone.** Both built real apps
against a real workspace, so the SDK's own CI depended on someone's content: it
could break because a page was edited, stop covering what it claimed because a
language was turned off, and a contributor with a fork could not run it at all.
That is a product integration test, not a test of this library. An SDK is a tool
for other people's developers, and its suite has to prove the SDK works and run
offline in any checkout.

Nothing was traded for a hand-written fake of the delivery API - a second
implementation of a contract this repo does not own drifts the moment the graph
moves, which is what `check-schema-drift` exists to prevent.

What replaces them is smaller and honest about its reach: the scaffold assets
are copied verbatim and were never compiled or read by any test here, which is
how a hardcoded `<html lang="en">` shipped for several releases. They are now
parsed, and every file that renders `<html>` must bind `lang` to a resolver and
name no language itself.

**Do I have to do anything?** Only if you upgraded to 11.5.0 and relied on the
derivation - pass `localizedPath` explicitly. Callers that already passed it are
unaffected. `checkCmssyEditMode` itself is unchanged for consumers: running it
against your own app and your own workspace is exactly what it is for.

## 11.5.0

**The Next and Remix scaffolds served every page as `<html lang="en">`.** A page
at `/no` declared English while rendering Norwegian - wrong for screen readers,
for translation, and for search engines. Only the Astro scaffold set it from the
page's language. `cmssy init` now owns the layouts that render `<html>`:
`app/[[...path]]/layout.tsx` and `app/cmssy-edit/[[...path]]/layout.tsx` for
Next, `app/root.tsx` for Remix.

**Do I have to do anything?** Yes - rerun `cmssy init`. Bumping the version
alone changes nothing here, because the fix is in the files `init` writes.

On an existing app `init` skips what is already there and prints what to do with
it. For Next, delete `app/layout.tsx` and move your global CSS import and
metadata into **both** `app/[[...path]]/layout.tsx` and
`app/cmssy-edit/[[...path]]/layout.tsx` - they are separate root layouts, and an
editor preview with no CSS is the usual way to find out you only did one. If you
have routes outside the cmssy catch-alls, give them a root layout of their own
under a route group (`app/(site)/layout.tsx`); without one the build fails with
"doesn't have a root layout". For Remix, set `<html lang={useCmssyLocale()}>` in
your root `Layout`.

`createCmssyProxy(..., { stripLocalePrefix: true })` is the one configuration
this does not reach: the proxy removes the language from the path before the
route sees it, so the layout has nothing to read. Those sites keep the default
language in `<html lang>`.

The language is taken from the route, not from a request header: a root layout
that reads a header opts every page out of static rendering, and these pages are
prerendered.

**New: `resolveCmssyLocale` (`@cmssy/core`) and `useCmssyLocale`
(`@cmssy/remix`).** Both answer `undefined` rather than guessing when no
language could be resolved, and React then omits the attribute. No `lang` is
honest; a wrong one is the bug above. This is about the attribute only - the
rendered content still falls back to the default language, as it always has,
because a page has to render in something.

**`checkCmssyEditMode` now checks the preview's language, and works out which
language to ask for by itself.** Pass `workspace` - which the scaffolded smoke
test already does - and it asks the delivery API which languages the workspace
enables, picks one that is not the default, and proves the editor renders a
prefixed URL in it. A workspace with one language is asked nothing about
language; a workspace that cannot be reached is reported rather than skipped.

Pass `localizedPath` only for a site that routes languages some other way than a
first path segment; it overrides the derivation entirely. Pass `editRoute:
false` if your app serves the editor from the page rather than a `/cmssy-edit`
route - `@cmssy/remix/testing` already does.

This is the check that would have caught 11.3.1 and 11.4.2 before release rather
than after. It was in the SDK all along and never ran: the language assertions
were reachable only by passing `localizedPath`, and no caller did. It also opens
the edit route directly now, not only through the rewrite, and reads
`frame-ancestors` rather than the mere presence of a CSP - an absent one
restricts nothing.

The alternative was writing a language into the CI workflow. A locale hardcoded
in a smoke test is one workspace's content: it goes stale the day that workspace
turns the language off, and it is wrong for anyone pointing the job at their own
workspace.

## 11.4.2

**`@cmssy/astro`: a request that reached `/cmssy-edit/...` directly rendered the
wrong language.** The locale was resolved from the whole pathname, and
`cmssy-edit` is its first segment - not a language - so `/cmssy-edit/no/blog`
answered with the default one. The same page reached the way the editor reaches
it, through the rewrite, answered correctly. Measured on a built Astro app: `no`
through the rewrite, `en` directly.

11.4.0 is what made this noticeable, not what broke it - the bug dates to
whenever the edit route first served a language-prefixed path. Nor was the path
unreachable before: no `frame-ancestors` header permits framing by everyone
rather than preventing it, and the wrong language was visible by opening the URL
in a tab, without any iframe.

Also fixed: `loadCmssyPage` stripped the edit prefix as a string rather than a
path segment, so a page slugged `cmssy-editorial` was fetched at the slug
`orial`. That one needs no editor at all - a plain visitor hits it.

The edit flag is set there too now. It was only ever set on the pass that
rewrites, so a direct hit relied on `loadCmssyPage` recognising edit mode from
the verified URL - which it does, making this consistency rather than a second
bug.

Nothing to do: update.

## 11.4.1

**`@cmssy/core`: a comma-separated `editorOrigin` locked every editor out.**
`CMSSY_EDITOR_ORIGIN` carries a list as one comma-separated string, and
`resolveEditorOrigin` split it - but only on the branch that reads the env var
itself. A config that passes `process.env.CMSSY_EDITOR_ORIGIN` in explicitly -
what the quickstart shows - takes the other branch, so the whole string was
treated as a single origin: `new URL()` parsed
`https://cmssy.io,https://cmssy.dev` down to the origin `https://cmssy.io,https`,
the CSP shipped that as `frame-ancestors`, and no editor could frame the app -
not even the one that worked before the second origin was added. Nothing threw
and nothing was logged. An explicit value is now split the same way the env var
always was, including per entry inside an array.

Configs written by `cmssy init` were never affected: they leave `editorOrigin`
unset, so they always took the env branch.

A wildcard hiding in such a string is caught now too. The check compared the
unsplit string against `"*"`, so `" * "` slipped past it and went out as
`frame-ancestors *` in production - any page could frame the app and the bridge
accepted messages from anywhere. `"*,https://…"` was never framed that way: it
failed the URL parse instead, with an "invalid editorOrigin" error that named
the wrong problem. Outside development both throw the wildcard error, as a bare
`"*"` always did.

**Do I have to do anything?** No, unless you worked around this by splitting the
value yourself before handing it to `defineCmssyConfig` - that still works and
can now go. Passing the raw env var through is the documented shape again. A
deploy that is throwing on start after the update was serving `frame-ancestors *`
to the public internet; set a concrete origin.

Precedence is unchanged: an explicit `editorOrigin` still decides on its own,
and one that is blank or empty still falls back to the cmssy defaults rather
than to the env var.

## 11.4.0

**`@cmssy/next`: the site-wide header and footer could not be edited on the
default configuration.** `CmssyLayoutSlot` declared its own prop type for the
`editable` component - `edit: { editorOrigin: string }` - and collapsed the
configured value to `editorOrigin[0]` to fit it. The default is two origins,
`https://cmssy.io` and `https://www.cmssy.io`, and the apex redirects to `www`,
so the admin answers on the entry that was being thrown away. With a single
value the bridge skips the referrer match entirely, posts at an origin nothing
listens on, and `isOriginAllowed` rejects every message the admin sends. Page
blocks were unaffected - `createCmssyPage` passes the list through.

**Do I have to do anything?** Only if you wrote your own editable-layout wrapper
and typed its prop as `edit: { editorOrigin: string }`. That prop is now
`string | string[]`, so a narrower type no longer satisfies it and the app stops
compiling. Widen it, or use `EditBridgeConfig` from `@cmssy/react`, which has
accepted both since the bridge was written. Apps passing `CmssyEditableLayout`
or `CmssyLazyLayout` need no change.

**`@cmssy/astro`: `/cmssy-edit/...` was served without framing headers when hit
directly.** The CSP was applied only on the branch that rewrites into the edit
route, so a request that already pointed at it mounted the bridge with no
`frame-ancestors` and no `X-Frame-Options`. The headers now go out for the edit
route however it was reached. If `editorOrigin` is too malformed to build a CSP
from, the route denies framing outright rather than throwing - a misconfigured
origin should not turn the whole route into a 500, and it must not leave the
page frameable either.

## 11.3.2

**`@cmssy/astro`: a language-prefixed URL rendered in the default language.**
`context.rewrite` re-runs the entire middleware chain on the rewritten URL -
Astro builds a fresh `AstroMiddleware` for it. The second pass saw `/shop`
rather than `/no/shop`, resolved the language from that, and overwrote what the
first pass had set. Measured on a built Astro 7 app: one request to `/no/blog`
entered the middleware twice and the page received `en`.

There is no second pass any more. The rewrite payload goes to `next`, which
Astro applies and renders without building a new middleware chain, rather than
to `context.rewrite`, which runs the chain again from the top. Measured on the
same app: one middleware entry per request, for the editor rewrite as well.

**The `astro` peer range is now `>=4.16`.** `next(payload)` is accepted from
4.13, but until 4.16 it swapped the route without swapping the request: the
`/shop` component rendered while `Astro.url` still said `/no/shop`, so the page
fetched the wrong slug. The old `>=4` was untrue anyway - `context.rewrite` does
not exist before 4.12 - but it failed loudly. Narrowing it keeps a version that
would silently render the wrong page from installing.

Both prefixes match a path segment now rather than a string: a page slugged
`november` under `/no` cannot become `/vember`, and `/cmssy-editorial` is a page
rather than the edit route. A stripped path also has its duplicate slashes
collapsed - `/no//evil.com/x` is protocol-relative, and resolving it would have
put the render on that origin. Astro does this itself only from 6.1.

The editor diagnostics page carries the framing CSP too, and renders rather than
throwing when the configured `editorOrigin` is too malformed to build one from -
which is among the things it exists to report.

This retires a blind spot too. The tests drove a mock whose `rewrite` merely
returned a response, so none could observe a second pass - which is how two
releases shipped locale fixes that a second pass undid. That mock now throws:
reaching for `context.rewrite` is the mistake, and a test says so.

Unchanged, and still unsupported: a site with `base` set. The strip reads the
full pathname, so the prefix is not found under a base - as in every release
before this one.

## 11.3.1

**`@cmssy/next`: a site with `resolveLocale` could only edit its default
language.** The language prefix was split off the slug only when `resolveLocale`
was absent. With it set, `/no/about` was looked up as the slug `"/no/about"` -
which no workspace has - so the page fell through to `notFound()`, and an editor
sees a 404 in an iframe as a blank preview rather than an error. Such a site was
fetching its layouts for `/about` and its page for `/no/about` in one render.
The public route was hit by the same rule wherever it keeps the prefix in its
URLs.

`resolveLocale` decides which language renders, as before; it no longer decides
what the slug is. A first segment that is not an enabled language stays part of
the slug, so `/de/about` is untouched on a site with no German.

Two things to check before updating, both only if you set `resolveLocale`:

- **Pages slugged with a language prefix now 404.** If your workspace really has
  a page at `no/about`, it was reachable at `/no/about` and stops being. One
  cmssy page is one slug carrying every translation, so this should not exist -
  but it is the one way this release can take a working URL away.
- **`appContext` receives the stripped path.** `path` no longer carries the
  prefix, so `"/" + path.join("/")` yields `/about`, not `/no/about`. An
  `appContext` that builds a canonical URL from it needs the language put back,
  or every language canonicalises to the default one. Apps without
  `resolveLocale` always got the stripped path; this makes the two agree.

Only a **non-default** language prefix is split. A site that prefixes every
language, its default included, still looks `/en/about` up as the slug
`en/about` - unchanged here, and the proxy declines to strip it too.

Prefixed URLs whose 404 was cached stay 404 until that entry revalidates.

`@cmssy/astro` and `@cmssy/remix` are unaffected: both resolve through
`resolveCmssyLayoutSlot`, which has always split the prefix off itself.

## 11.3.0

**`cmssy types` now vendors the delivery operations too.** Every cmssy app
hand-wrote the same reads, so `cmssy/operations.graphql` is written next to the
model types - ten documents, as `.graphql` your own codegen consumes:

```bash
npx @cmssy/cli types                  # models + operations
npx @cmssy/cli types --operations-out graphql/cmssy.graphql
npx @cmssy/cli types --no-operations
```

They are the constants `@cmssy/core` queries with, referenced rather than
restated, so the vendored file cannot drift from what the client sends.

- **Point `documents` in your `codegen.ts` at `cmssy/**/*.graphql`**, or the
  file is written and never read.
- **An app that already declares these names gets a refusal, not a broken
  build.** Two documents cannot share an operation name in graphql-codegen's
  client preset, so the CLI checks your `.graphql` files first and names the
  conflicting file. Delete your copies, or keep them with `--no-operations`.
- Vendored, not owned: every run rewrites the file. An app needing a different
  selection set writes its own query under its own name.
- No workspace, no network: written before the model half, so it lands in a
  repo that is not linked yet - though the command still exits non-zero there,
  because the models half failed.
- `--check` covers it as it covers the models.
- `PublicPagesByType` is deliberately not generated: every app's version differs
  and the SDK has none, so generating one would mean inventing it. The dev-only
  second `PublicPage` document is excluded for the same reason it would break a
  build - it reuses the name.

## 11.2.0

**The editor smoke check can now tell a real editor from one that only looks
alive.** It asserted that a layout slot was mounted - which every scaffold
renders whether or not the request was verified. That is how the Astro adapter
ran with edit mode permanently off for months, and how 11.1.0 shipped a fix that
was inert on the framework it was written for, both with this check green.

- `CmssyLazyLayout`'s server-rendered marker now also reports how many blocks it
  resolved content for (`data-cmssy-editor-content`).
- `checkCmssyEditMode` fails when every slot reports zero, with the diagnosis
  spelled out: not in edit mode, no preview secret, editing the published page.
  Only when `workspace` is passed - an empty position legally resolves to zero.
- A consumer on an older `@cmssy/react` gets a distinct failure naming the
  version, rather than a confusing zero.

Also: a relation field in a layout block is now covered end to end - ids in,
records out - which was the acceptance criterion for 11.1.0 that no live
workspace could demonstrate, and every package snapshots its public exports, so
"the surface grows by one function" is a diff rather than a sentence in a pull
request.

## 11.1.1

**The Astro editor was never in edit mode.** The middleware set the edit header
and then rewrote onto `/cmssy-edit` with a path string, so Astro built a fresh
request for the rewritten route and the header never arrived. `loadCmssyPage`
therefore ran with `isEdit: false`, which means it fetched **without the preview
secret** - the editor showed the published page while claiming to edit the
draft - and, since 11.1.0, resolved no editor data either.

Nothing reported it: the edit page passes `edit={{ editorOrigin }}` regardless,
so the bridge mounted and the smoke test's markup marker appeared either way.

- the middleware rewrites with a `Request`, so the headers it sets survive;
- `loadCmssyPage` also accepts a verified edit URL as the signal, which is what
  the React Router loader has always done and what survives any rewrite.

Verified on a scaffolded app: `isEdit` true, and the canvas receives
`resolvedContent` for the header and the footer separately.

## 11.1.0

**Astro and React Router get the layout guarantees Next already had.** Both
adapters carried their own copy of the layout logic, and both were missing the
third of its three rules: they never passed `resolvedContent` to the canvas, so
a relation field in a header block showed the raw ids it stores. The site looked
right; the editor could select the header and not fill it.

- New `resolveCmssyLayoutSlot` in `@cmssy/react` - the framework-free half:
  preview secret in edit mode, language, editor data. `CmssyLayoutSlot`,
  `loadCmssyPage` and `createCmssyLoader` are now three renderers over one
  function instead of three implementations.
- `loadCmssyPage(config, request, url, { blocks })` and
  `createCmssyLoader(config, { blocks })` take an options argument and return
  `editorData`, **keyed by position** - the header and the footer resolve to
  different data.
- Fixed: a layout block with `isActive` unset was hidden by the SDK renderers
  and shown by the scaffolds. `isActive` is nullable in the schema, so unset now
  means active everywhere.

Nothing is removed and no signature is broken. `cmssy init` writes the new
wiring; an existing Astro or React Router app adds `{ blocks }` and forwards
`editorData` to get its editor fixed.

## 11.0.0

**Public routes were never cached. Now they are.** Every v10 release served
`Cache-Control: private, no-cache, no-store` from routes declaring
`export const revalidate` - measured on a fresh `cmssy init` app, on
cmssy-next-starter, and on cmssy-demo in production. Two independent causes: the
scaffold generated no static params, and `CmssyLayoutSlot` read `headers()`.

**You have to do something** - see [v10 → v11](docs/migrations/v10-to-v11.md):

- `CmssyLayoutSlot` takes a required `editMode` prop: `false` on the public
  route, `true` on `/cmssy-edit`. Required rather than defaulted because the
  wrong value is invisible - an edit route that says `false` wraps draft content
  in published chrome.
- The slot's locale fallback to the request header is gone. Pass `path`
  (preferred) or an explicit `locale`; the type takes one, never neither. A
  cached route never sees the header the proxy set, so that fallback rendered the
  wrong language while looking correct.
- `cmssy init` writes `services/pages.ts` and a `generateStaticParams` in the
  catch-all. Existing apps add their own - without it the other two changes
  achieve nothing.

`draftMode()` was never a cause; reading it does not mark a route dynamic in
Next 16. The draft route and the proxy are unchanged.

`starter-smoke` now asserts cache headers on Next. This survived ten minor
versions because every check read markup, and markup looks identical either way.

## 10.10.0

**`CmssyLayoutSlot` is back.** 10.0 removed it as a helper doing the app's work.
The evidence since says otherwise: every consumer wrote nearly the same file -
cmssy-demo, the starter, and all three `cmssy init` templates - and two of them
shipped an editor that could select the header and not fill it. Rendering layout
blocks through the edit bridge is editor wiring, which the slim rule keeps in
the SDK; removing it misapplied that rule.

```tsx
<CmssyLayoutSlot
  config={cmssy}
  blocks={blocks}
  position="header"
  path={path}
  editable={EditableLayout}
/>
```

It is not the old one. The version removed in 10.0 read `headers()` to find the
language, which forced every page dynamic and gave up ISR; this one takes the
routed `path`, and only falls back to the header when a root layout leaves it no
params. `editable` is required rather than optional - omitting it is exactly the
bug - and the editor gets `resolvedContent` as well as loader data.

`LayoutPosition` and `layoutPositionValues` are exported now, so the other four
positions (`top`, `sidebar_left`, `sidebar_right`, `bottom`) are discoverable
instead of folklore.

`cmssy init` no longer scaffolds a hand-written slot for Next; Astro and React
Router keep theirs, since neither renders through this component.

## 10.9.2

**Nothing to do unless you delete cookies through the proxy.** A
`CmssyProxyCookie` with an empty value is a deletion, but the caller's `options`
were applied last - and those are the options the cookie was written with,
`maxAge` included. The cookie came back emptied and alive instead of removed.
Deletion wins now.

## 10.9.1

**Nothing to do.** The `cmssy init` template still imported
`resolveEditorLayoutBlockData` from `@cmssy/react/internal-server`, which 10.9.0
had just made unnecessary.

## 10.9.0

**Nothing to do.** Two things an app had to work around are now supported.

**The editor-data resolvers are public.** `resolveEditorBlockData` and
`resolveEditorLayoutBlockData` moved from `@cmssy/react/internal-server` onto
`@cmssy/react`. Every app that wanted an editable header had to import from a
subpath with no semver promise - while the types (`EditorBlockData`,
`ResolveLayoutBlockDataOptions`) were public all along. The old path still
works.

```diff
- import { resolveEditorLayoutBlockData } from "@cmssy/react/internal-server";
+ import { resolveEditorLayoutBlockData } from "@cmssy/react";
```

**`createCmssyProxy` takes cookies.** An app with a session to refresh or a
cart id to mint used to re-implement the entire preset - locale, edit rewrite
and CSP - to add one cookie:

```ts
export const proxy = createCmssyProxy(cmssy, {
  cookies: async (request) => [...(await refreshSession(request))],
});
```

They are set on the response **and** merged into the cookie header the app is
rendered with, so a refreshed session does not first render signed out. An
empty value deletes the cookie.

## 10.8.0

**Nothing to do, but re-run `cmssy init` (or copy one file) if your Astro or
React Router app has no header.**

`cmssy init` scaffolded no layout slot on Astro and React Router: both loaders
already returned the layout groups, and neither template rendered them - so a
freshly initialised app had no header or footer, publicly or in the editor.
Both now scaffold `cmssy/layout-slot.tsx`. Next got the same fix in 10.6.0.

Found by the starter smoke test, which - it turns out - had never run: every
meaningful step was gated on a repo secret that was never set, so it scaffolded
an app and stopped while the check went green. It never needed a secret. Edit
mode is verified by comparing the URL's `cmssySecret` to the app's own
`draftSecret` (a local string comparison), and the content comes from a public
workspace.

`CmssyLazyLayout` now server-renders a hidden `data-cmssy-layout-slot` marker.
Its blocks mount on the client, so nothing in the edit route's HTML used to say
whether a slot was mounted at all - which is exactly what "the editor lets me
select the header but shows no fields" means. `checkCmssyEditMode` reads it.

## 10.7.0

**Nothing to do.** Two guards, both opt-in, both closing a hole that let a real
regression ship with green CI.

`cmssy types --check` fails when the generated model types differ from the
workspace, naming what moved:

```
cmssy: graphql/models.ts is out of date with the "shop" workspace
  + models: Review
  + fields: sku
  run `cmssy types` and commit the result
```

Put it in CI and a model edited in the CMS stops being a runtime `undefined`.
It writes nothing in check mode.

`checkCmssyEditMode` takes a `workspace` now:

```ts
await checkCmssyEditMode({
  baseUrl,
  secret,
  workspace: { org, workspaceSlug },
});
```

Given it, the check asks the delivery API whether the workspace HAS layout
blocks - so an app that renders no header stops looking like a workspace that
has none. That ambiguity is why the smoke test stayed green while `cmssy init`
scaffolded an editable-layout wrapper with nothing mounting it. An unreachable
API degrades to "unknown" and is never reported as a fault of the app.

## 10.6.1

**Nothing to do.** `cmssy types --out /abs/path.ts` wrote to
`<cwd>/abs/path.ts` while reporting the absolute one - the path was joined onto
the working directory instead of resolved against it. Relative paths were
unaffected.

## 10.6.0

**Nothing to do.** Two additions, both opt-in.

`client.query` / `client.queryScoped` now accept a **typed document** - what
graphql-codegen emits, in either mode - alongside the query string they always
took:

```ts
const data = await client.query(PublicPageMetaDocument, {
  workspaceSlug,
  slug,
});
```

The variables are checked and the result inferred, so the repeated generic, the
`.toString()` and the `print()` all go away. A query string behaves exactly as
before. The client still has three members; the public surface grows by one type
(`CmssyTypedDocument`). Apps no longer need `graphql` at runtime just to print a
document they generated.

**`cmssy types`** writes TypeScript for the workspace's models, so a record's
`data` is a typed object instead of `unknown`:

```bash
npx @cmssy/cli types            # writes cmssy/models.ts
```

Required → non-optional, localized → `CmssyLocalized`, select → the union of the
configured options, relation → the ids it stores, object and repeater inlined.
It reads the public delivery path with the slugs the app already has, so no API
token and it runs in CI.

**Fixed:** `cmssy init` scaffolded `cmssy/editable-layout.tsx` with nothing
mounting it, so a freshly initialised app had a header the editor could select
and not fill. It now writes `cmssy/layout-slot.tsx` and mounts it in both page
templates. Existing apps: copy that file from the starter.

## 10.0.0 - 10.5.2

**Breaking, and you have to do something.** The SDK stopped mirroring the graph:
anything expressible as a GraphQL query is now your app's query. Removed:
`buildCmssyMetadata`, `createCmssySitemap` / `createCmssyRobots`,
`createCmssyNotFound`, `CmssyLayoutSlot`, `CmssyLink`, `getCmssyLocale`, member
auth (routes, session helpers, `config.auth`), commerce (cart/orders routes,
`fetchProducts`, the product/cart/checkout blocks), the provider hooks, and the
`fetchPage` / `fetchLayouts` / `fetchSiteConfig` family. ~110 public symbols
became ~22.

10.3.0 replaced the growing typed block context with one open channel:
`appContext` on `createCmssyPage` and the renderers reaches every block as
`context.app`. `blockPageOf` is gone.

[The v9 → v10 guide](docs/migrations/v9-to-v10.md) lists every removed symbol
next to its replacement, plus the three things that break silently once you
write that replacement yourself (language-keyed fields, the routed path, one
`<url>` per language).

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
