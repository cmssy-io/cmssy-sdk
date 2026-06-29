---
title: Quickstart
description: Build a working headless cmssy site in a Next.js app - config, the catch-all page route, a blocks registry, draft mode, and your first rendered page.
---

# Quickstart

> Status: outline (CMS-771). The steps and APIs below are accurate; prose and a
> runnable example repo are still being filled in.

Build a headless site on cmssy in four files.

## 1. Install

```bash
npm i @cmssy/next @cmssy/react
```

## 2. Configure

```ts
// cmssy.config.ts
import type { CmssyNextConfig } from "@cmssy/next";

export const cmssy: CmssyNextConfig = {
  apiUrl: process.env.CMSSY_API_URL!, // full GraphQL endpoint, e.g. https://api.cmssy.io/graphql
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG!,
  draftSecret: process.env.CMSSY_DRAFT_SECRET!,
  editorOrigin: process.env.CMSSY_EDITOR_ORIGIN!,
  defaultLocale: "en",
  enabledLocales: ["en"],
};
```

## 3. Register your blocks

```ts
// cmssy/blocks.ts
import { myHeroBlock } from "@/blocks/hero/block";
export const blocks = [myHeroBlock /* ... */];
```

See [Authoring a block](../building-blocks/authoring-blocks.md).

## 4. Render pages + draft mode

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";

export default createCmssyPage(cmssy, blocks);
```

```ts
// app/api/draft/route.ts
import { createDraftRoute } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

export const GET = createDraftRoute(cmssy);
```

## Next steps

- SEO: `buildCmssyMetadata`, `createCmssyRobots`, `createCmssySitemap`.
- i18n: locale middleware + `getCmssyLocale`.
- Editor framing: `applyCmssyCsp` / `isCmssyEditRequest` in `middleware.ts`.

> TODO: companion example under `examples/quickstart`; `cmssy init` CLI flow;
> environment-variable reference.
