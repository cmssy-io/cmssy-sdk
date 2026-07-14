# Migrating to SDK 4

**Symptom if you skip this: the editor preview is blank.** The site keeps
building, keeps serving, keeps passing your tests. Only the editor is dead. Two
of our own apps shipped like that.

## What changed, and why

In 3.x the editor rendered through your public catch-all: middleware set a
header, and the page mounted the editor when it saw it.

That stopped working once pages could be static. **A static page never sees the
query string**, so `?cmssyEdit=1` cannot reach it - the editor would get the
cached, published HTML.

So in 4.x a **verified** editor request (`cmssyEdit=1` **and** a `cmssySecret`
matching your draft secret) is rewritten onto a dedicated dynamic route:

```
/about?cmssyEdit=1&cmssySecret=…   →   /cmssy-edit/about
```

Your public pages stay static. The editor gets a route that is dynamic by
design.

## The migration

### 1. Mount the route the rewrite points at

```tsx
// app/cmssy-edit/[[...path]]/page.tsx
import { createCmssyEditPage } from "@cmssy/next";
import { cmssy } from "@/cmssy/config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

export const dynamic = "force-dynamic";

export default createCmssyEditPage(cmssy, blocks, { editor: CmssyEditor });
```

Without it the rewrite lands on a 404 and the iframe shows nothing. In dev the
SDK now tells you so.

### 2. Move the middleware onto the rewrite

The easy way - the preset does the whole thing, in the order it has to happen:

```ts
// proxy.ts
import { createCmssyProxy, cmssyProxyMatcher } from "@cmssy/next/preset";
import { cmssy } from "@/cmssy/config";

export const proxy = createCmssyProxy(cmssy);
export const config = { matcher: cmssyProxyMatcher };
```

By hand, if your middleware does other things too:

```ts
const requestHeaders = new Headers(request.headers);
requestHeaders.delete(CMSSY_EDIT_HEADER); // a client must not forge it
requestHeaders.set(
  CMSSY_LOCALE_HEADER,
  await localeForPathname(cmssy, pathname),
);

const editHeaders = new Headers(requestHeaders);
editHeaders.set(CMSSY_EDIT_HEADER, "1"); // the layout reads this to become editable

const rewrite = await cmssyEditRewrite(request, cmssy, {
  requestHeaders: editHeaders,
});
if (rewrite) {
  applyCmssyCsp(rewrite, { editorOrigin: cmssy.editorOrigin });
  return rewrite;
}
```

**Both headers matter.** Drop the locale and the preview renders in the wrong
language. Drop the edit flag and your header and footer become markup the editor
can select and cannot fill - it looks like a broken editor, and it is a missing
header.

### 3. Keep the chrome editable

The header and the footer are layout **blocks**. Rendered server-side they are
just markup. In edit mode they have to go through the edit bridge:

```tsx
<CmssyChrome
  config={cmssy}
  blocks={blocks}
  position="header"
  editable={EditableLayout}
/>
```

(`EditableLayout` is your client wrapper around `CmssyLazyLayout` - four lines,
see the reference wiring.)

Also fetch the layout with `previewSecret` in edit mode, or the editor shows you
the **published** chrome while you edit the draft.

### 4. SEO: pass the routed path (4.1.0)

```diff
- const { path: stripped } = await splitCmssyLocale(cmssy, path);
- return buildCmssyMetadata(cmssy, stripped);
+ return buildCmssyMetadata(cmssy, path);
```

The prefix **is** the language. Stripping it made every translated page serve the
default language's title and a canonical pointing at the default language's URL -
which tells Google the translation is a duplicate.

## Prove it works

A build cannot tell you whether the editor lives. This can:

```ts
import { checkCmssyEditMode } from "@cmssy/next/testing";

const result = await checkCmssyEditMode({
  baseUrl,
  secret: process.env.CMSSY_DRAFT_SECRET,
});
expect(result.failures).toEqual([]);
```

Run it against a started production build. It asserts that a verified request
renders the editor, that an unverified one does **not**, and that the chrome
reached the edit bridge instead of staying plain markup.
