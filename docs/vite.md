# cmssy on React + Vite

There is no `@cmssy/vite` package, and there does not need to be. A Vite app -
an SPA from `npm create vite`, or Vite SSR - renders cmssy content with two
pieces of `@cmssy/react`:

- **`loadCmssyRoute(config, options)`** - one `await` that returns everything a
  route needs: the page, the layout groups, the language, and the content and
  loader data of every block, on the page and in every region.
- **`CmssyBlocks` and `CmssyLayoutRegion`** - **synchronous** components that
  render that data. They are not Server Components, so they run anywhere React
  runs: in the browser, in `renderToString`, in a test.

`CmssyServerPage` and `CmssyServerLayout` are async components. A client-only
app cannot render them, and classic SSR cannot either. Everything below uses the
synchronous pair instead.

## SPA

```tsx
// src/App.tsx
import { CmssyRoute } from "@cmssy/react/spa";
import { cmssy } from "./cmssy.config";
import { blocks } from "./cmssy/blocks";

export default function App() {
  return (
    <CmssyRoute
      config={cmssy}
      blocks={blocks}
      fallback={<p>Loading…</p>}
      notFound={<h1>Not found</h1>}
    >
      {({ Region, Blocks }) => (
        <>
          <Region id="header" />
          <main>
            <Blocks />
          </main>
          <Region id="footer" />
        </>
      )}
    </CmssyRoute>
  );
}
```

`CmssyRoute` reads the path from `window.location` unless you pass `path`, so a
router gives it the current location and nothing else changes:

```tsx
const location = useLocation();
<CmssyRoute config={cmssy} blocks={blocks} path={location.pathname}>
  …
</CmssyRoute>;
```

`useCmssyRoute(config, options)` is the same thing without the rendering, for an
app that wants the data on its own terms. Both keep the newest answer: a load
that was already in flight when the path changed cannot overwrite the new one.

The delivery API answers a browser directly - `POST /public/<org>/<workspace>/graphql`
sends `Access-Control-Allow-Origin: *` and answers the preflight, so no proxy is
needed. Send no cookies: the wildcard and `credentials: "include"` are mutually
exclusive, and a cart session belongs in the `x-cart-session` header.

## Vite SSR

The same loader runs in `entry-server`, and the same components render the
result. The data travels to the client so hydration matches:

```tsx
// src/entry-server.tsx
export async function render(url: string) {
  const route = await loadCmssyRoute(cmssy, {
    blocks,
    path: url.split("/").filter(Boolean),
  });
  const html = renderToString(<Site route={route} />);
  return { html, state: route };
}
```

```tsx
// src/entry-client.tsx
hydrateRoot(
  document.getElementById("root")!,
  <Site route={window.__CMSSY__} />,
);
```

Hydration is stable because every value the render depends on - the folded
language, the block content, the loader data - is in `route`, and the client
renders the same object rather than fetching it again.

## What an SPA gives up

- **SEO.** The HTML a crawler gets is an empty shell. Use Vite SSR (above) when
  the pages have to be indexed.
- **Sitemap and robots.** Both need a server. `@cmssy/next`, `@cmssy/astro` and
  the SSR setup have one; a static SPA does not.
- **The draft secret.** The editor reaches a page with a secret, and a
  client-only app would have to ship that secret in its bundle. Never do that -
  preview drafts from an SSR build or from one of the framework adapters.

## The live editor

`@cmssy/react/client` imports neither Next nor anything RSC-only - it is plain
React and DOM - so nothing in it stops `CmssyEditablePage` and `CmssyLazyLayout`
from running in a Vite app. Two things are on you, and neither has been proven
end to end here: the admin has to be allowed to frame the app (the CSP that
`cmssyCspHeaders` sets for the adapters), and edit mode needs the draft secret,
which a client-only bundle cannot keep. Edit from an SSR build.

## RSC

`CmssyServerPage` and `CmssyServerLayout` are ordinary async components that
import nothing framework-specific, so `@vitejs/plugin-rsc` should run them
unchanged - untested, and no adapter is planned either way.

## What was checked

A Vite 8 React app, `@cmssy/react` from source, against a live workspace:

- the SPA above renders a published page in the browser, with no proxy;
- the same route data rendered by `renderToString` and hydrated by
  `hydrateRoot` produces no hydration warning;
- `POST /public/<org>/<workspace>/graphql` answers a cross-origin preflight with
  `Access-Control-Allow-Origin: *`.

One trap, and it is not cmssy's: linking the package locally can give the app a
second copy of React, which fails with `Cannot read properties of null (reading
'useMemo')`. `resolve: { dedupe: ["react", "react-dom"] }` in `vite.config.ts`
is the fix.
