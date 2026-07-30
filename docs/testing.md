# Testing a cmssy app

## The editor is the path your build cannot check

A site whose editor is dead still compiles, still serves, still passes your unit
tests. We shipped exactly that - twice, in two apps, on two SDK bumps, with
everything green.

```ts
import { checkCmssyEditMode } from "@cmssy/next/testing";

const result = await checkCmssyEditMode({
  baseUrl: "http://localhost:3000",
  secret: process.env.CMSSY_DRAFT_SECRET!,
  path: "/",
  expectLayoutBlocks: true,
  localizedPath: "/no",
});

expect(result.failures).toEqual([]);
```

Run it against a **started production build** (`next build && next start`), not
the dev server: static rendering is the thing that made the edit route necessary
in the first place.

## What it asserts

1. The public page returns 200, **without** the editor, with the header and footer rendered
   server-side.
2. A bare `?cmssyEdit=1` (no secret) does **not** enter edit mode. An unverified
   request must never open the door.
3. A verified `cmssyEdit=1` + `cmssySecret` renders the editor **and** moves the
   header and footer onto the edit bridge.
4. When you pass `expectLayoutBlocks`: the layout slot is mounted **and it
   resolved content for the editor**. See below - this is the assertion that
   catches the editor that only looks alive.
5. When you pass `localizedPath`: the localized preview **declares** the
   language its URL asks for (`<html lang>`), and the edit route answers the
   same language reached directly as it does through the rewrite.
6. That the edit route can be framed: its `frame-ancestors` must admit the cmssy
   editor. A missing CSP is fine - it restricts nothing.

### Options

Pass `localizedLocale` if the language your site declares is not the path
segment itself (`nb-NO` under `/no`).

`editRoute: false` says the app serves the editor from the page rather than a
`/cmssy-edit` route. `@cmssy/remix/testing` already passes it - a React Router
page always sees its query string, so that adapter mounts no such route and
`/cmssy-edit/...` there is an ordinary page slug.

## The one that matters: a slot that resolved nothing

Every scaffold renders its layout slot whether or not the request was verified.
So "a slot is mounted" was never evidence of edit mode - and an adapter shipped
with edit mode permanently off, fetching without the preview secret, handing the
canvas nothing, while this check stayed green.

Since 11.2.0 the slot also reports how many blocks it resolved content for
(`data-cmssy-editor-content`), and the check fails when every slot reports zero:

```
edit /: every layout slot resolved 0 blocks for the editor. The slot is mounted
but was not rendered in edit mode - the canvas gets nothing and the fetch ran
without the preview secret, so you are editing the published page.
```

A site with no layout blocks legally resolves to zero, so this assertion only
runs when you say the site has them. You state it, and the check stays offline
from your CMS - it talks to your app and nothing else:

```ts
const result = await checkCmssyEditMode({
  baseUrl,
  secret: process.env.CMSSY_DRAFT_SECRET!,
  expectLayoutBlocks: true,
});
```

Set it for a site whose header and footer are cmssy blocks. Leave it off and the
mounted-slot and resolved-content assertions do not run.

## `skipped`: what a green result did not check

`failures` being empty answers "did anything fail", not "was anything checked".
Four assertions only run when the call gives them something to run against, so
the result names the ones that did not:

```ts
const result = await checkCmssyEditMode({ baseUrl, secret });

expect(result.failures).toEqual([]);
console.log(result.skipped);
// layout bridge: the public / server-rendered no <header> or <footer>, ...
// layout slot: expectLayoutBlocks is not set, ...
// language: no localizedPath, ...
```

Print it in CI. A run that skips three of six assertions and reports green is the
shape both of our dead-editor releases had.

## Why "no `<header>` in the SSR" means success

In edit mode the header and footer mount through the edit bridge, which renders on the
**client**. So a header that is still in the server-rendered HTML is a header the
editor can select and cannot edit - the difference between an editable block and
plain markup.

That is the check that would have caught our second outage, and the one whose
failure message names the cause:

```
edit /shop: the header and footer are still server-rendered - they will be
selectable but have no fields (is CMSSY_EDIT_HEADER set on the rewrite?)
```

## In CI

```yaml
- run: pnpm build
- run: |
    pnpm start &
    npx wait-on http://localhost:3000 --timeout 60000
- run: pnpm smoke:edit
```

Skip the job when `CMSSY_DRAFT_SECRET` is absent - a green check that verifies
nothing is worse than no check.
