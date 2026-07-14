# cmssy app

A Next.js app wired to cmssy: pages render from the CMS, the editor works, and
`pnpm smoke:edit` proves it stays that way.

## Start

1. `cp .env.example .env.local` - values live in **Settings → Headless** in the
   cmssy dashboard.
2. `pnpm install && pnpm dev`

## What is where

| File | Why it exists |
| --- | --- |
| `proxy.ts` | Resolves the language, sends verified editor traffic to `/cmssy-edit`, lets the admin frame the site. |
| `app/[[...path]]/page.tsx` | Every published cmssy page. Static where it can be. |
| `app/cmssy-edit/[[...path]]/page.tsx` | The editor. **Delete it and the preview goes blank.** |
| `app/layout.tsx` | Header and footer - cmssy layout blocks, editable like any other block. |
| `cmssy/blocks.ts` | Your components, registered as blocks. |
| `scripts/smoke-edit.mjs` | The editor is the one path a build cannot check. This checks it. |

## Prove the editor still works

```bash
pnpm build && pnpm start &
pnpm smoke:edit
```

A site whose editor is dead still compiles and serves. This is what catches that.

## Docs

- [Reference wiring](https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/wiring.md)
- [Troubleshooting: symptom → cause](https://github.com/cmssy-io/cmssy-sdk/blob/main/docs/troubleshooting.md)
