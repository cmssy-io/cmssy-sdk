# cmssy on Astro

`@cmssy/astro` exists to make one claim checkable: **cmssy is headless for any
frontend, not for Next.**

It depends on `@cmssy/core` and nothing else. A test in the package fails the
build if a single file imports React or Next.

## Wiring

```ts
// src/cmssy.config.ts
import { defineCmssyConfig } from "@cmssy/astro";

export const cmssy = defineCmssyConfig({
  org: import.meta.env.CMSSY_ORG_SLUG,
  workspaceSlug: import.meta.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: import.meta.env.CMSSY_DRAFT_SECRET,
});
```

```ts
// src/middleware.ts
import { cmssyMiddleware } from "@cmssy/astro";
import { cmssy } from "./cmssy.config";

export const onRequest = cmssyMiddleware(cmssy);
```

That is the adapter. It resolves the language, routes a **verified** editor
request to `/cmssy-edit/...`, and applies the CSP that lets the admin frame your
site - in that order, because the order is what makes it correct.

## The pages

```astro
---
// src/pages/[...path].astro
import { loadCmssyPage } from "@cmssy/astro";
import { cmssy } from "../cmssy.config";
import Blocks from "../components/Blocks.astro";

const { page, locale } = await loadCmssyPage(cmssy, Astro.request, Astro.url);
if (!page) return Astro.redirect("/404");
---
<Blocks blocks={page.blocks} locale={locale} />
```

```astro
---
// src/pages/cmssy-edit/[...path].astro  ← the editor lands here
export const prerender = false;
import { loadCmssyPage } from "@cmssy/astro";
import { cmssy } from "../../cmssy.config";
import Editor from "../../components/Editor";   // a React island

const { page, locale } = await loadCmssyPage(cmssy, Astro.request, Astro.url);
---
<Editor client:load page={page} locale={locale} />
```

**Skip the edit route and the editor preview is blank.** It is the single most
common way to break a cmssy app, on any framework.

## SEO

```ts
// src/pages/sitemap.xml.ts
import { createCmssySitemap } from "@cmssy/astro";
import { cmssy } from "../cmssy.config";

export const GET = createCmssySitemap(cmssy);
```

One `<url>` per language: a translated page is not a duplicate, and telling
Google it is keeps the translation out of the index.

## Rendering blocks

Astro renders whatever you like. Two honest options:

- **`.astro` components** - fastest, zero client JS, and the public site never
  ships a framework.
- **React islands** (`@astrojs/react` + your `@cmssy/react` blocks) - reuse the
  block components you already have. The **edit bridge is a React island** either
  way, because the editor talks over `postMessage` to a client component.

The protocol is in `@cmssy/core`, so a Vue bridge would speak it too. That is the
whole point of the layering.

## Prove the editor works

```ts
import { checkCmssyEditMode } from "@cmssy/astro/testing";

const result = await checkCmssyEditMode({ baseUrl, secret });
expect(result.failures).toEqual([]);
```

Same check, same protocol, different framework - which is the proof.
