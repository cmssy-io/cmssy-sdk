# cmssy SDK

Headless SDK for [cmssy](https://cmssy.io) — register your own React components as
blocks, render cmssy pages in your own app, and edit them visually through the cmssy
editor. cmssy keeps the backend (content, commerce, auth, forms, data) and the visual
editor; your app owns rendering and hosting.

## Packages

| Package | Description |
| --- | --- |
| `@cmssy/react` | Framework-agnostic core: component registry, field controls, `<CmssyPage>`, the editor bridge agent, content/data clients, the versioned postMessage protocol. |
| `@cmssy/next` | Next.js adapter: catch-all route helper, draft mode, framing CSP. _(in progress)_ |

## Status

Early — built against cmssy epic CMS-642 (headless pivot). Not yet published.
