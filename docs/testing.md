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
  // Only if your URLs carry the language. The check reads <html lang> - a
  // contract - rather than hunting for a word from your copy, which an editor
  // can rewrite at any time.
  localizedPath: "/no",
});

expect(result.failures).toEqual([]);
```

Run it against a **started production build** (`next build && next start`), not
the dev server: static rendering is the thing that made the edit route necessary
in the first place.

## What it asserts

1. The public page returns 200, **without** the editor, with the chrome rendered
   server-side.
2. A bare `?cmssyEdit=1` (no secret) does **not** enter edit mode. An unverified
   request must never open the door.
3. A verified `cmssyEdit=1` + `cmssySecret` renders the editor **and** moves the
   chrome onto the edit bridge.
4. Optionally: the localized preview **declares** the language its URL asks for (`<html lang>`).

## Why "no `<header>` in the SSR" means success

In edit mode the chrome is mounted through the edit bridge, which renders on the
**client**. So a header that is still in the server-rendered HTML is a header the
editor can select and cannot edit - the difference between an editable block and
plain markup.

That is the check that would have caught our second outage, and the one whose
failure message names the cause:

```
edit /shop: the chrome is still server-rendered - the header and footer will be
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
