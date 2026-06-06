# @cmssy/next

Next.js (App Router) bindings for a [cmssy](https://cmssy.com) headless site.
One catch-all route renders your published cmssy content with local block
components, with live edit-mode preview built in. Pairs with
[`@cmssy/react`](https://www.npmjs.com/package/@cmssy/react) (blocks + data).

```bash
pnpm add @cmssy/next @cmssy/react
```

## Render every page

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage } from "@cmssy/next";
import { cmssy } from "@/cmssy/config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
```

```ts
// cmssy/config.ts
import type { CmssyNextConfig } from "@cmssy/next";

export const cmssy: CmssyNextConfig = {
  apiUrl: process.env.CMSSY_API_URL ?? "", // public GraphQL delivery endpoint
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG ?? "",
  draftSecret: process.env.CMSSY_DRAFT_SECRET ?? "", // edit-mode preview handshake
  editorOrigin: process.env.CMSSY_EDITOR_ORIGIN ?? "", // only needed in edit mode
  defaultLocale: "en",
};
```

`createCmssyPage` fetches the page for the request path and renders it. In edit
mode (draft cookie or `?cmssyEdit=1`) it renders your `editor` instead and frames
the live-edit bridge. A published build does **not** require `editorOrigin`.

## Draft preview + revalidation

```ts
// app/api/draft/route.ts
import { createDraftRoute } from "@cmssy/next";
export const GET = createDraftRoute(cmssy);
```

## Edit-mode CSP

```ts
import { cmssyCspHeaders, applyCmssyCsp } from "@cmssy/next";
```

Helpers to frame the page inside the cmssy editor only in edit mode.

## Exports

`createCmssyPage`, `createDraftRoute`, `cmssyCspHeaders` / `applyCmssyCsp`,
`isCmssyEditRequest` / `isCmssyEditMode`, and the `CmssyNextConfig` type.

## License

MIT
