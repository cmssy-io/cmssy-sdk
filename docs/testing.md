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
  workspace: { org: "acme", workspaceSlug: "shop" },
  // Only if your URLs carry the language. You state it: the check will not ask
  // a workspace what to assert, because that ties its coverage to content that
  // can change or be deleted.
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
4. When you pass `workspace`: the layout slot is mounted **and it resolved
   content for the editor**. See below - this is the assertion that catches the
   editor that only looks alive.
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

It needs `workspace` to know the site has layout blocks at all - an empty
position legally resolves to zero:

```ts
const result = await checkCmssyEditMode({
  baseUrl,
  secret: process.env.CMSSY_DRAFT_SECRET!,
  workspace: {
    org: process.env.CMSSY_ORG_SLUG!,
    workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG!,
  },
});
```

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

Skip the job when the workspace secrets are absent - a green check that verifies
nothing is worse than no check.
