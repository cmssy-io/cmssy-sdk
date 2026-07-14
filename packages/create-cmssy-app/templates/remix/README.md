# cmssy on React Router 7 (Remix)

A cmssy site that works, is editable, and proves it stays that way.

```bash
cp .env.example .env
pnpm install && pnpm dev
```

## What is wired

- `app/routes/page.tsx` - the cmssy page. `createCmssyLoader` fetches it, and a
  **verified** editor request (`cmssyEdit=1` + a matching `cmssySecret`) renders
  the same page through the edit bridge.
- `headers` - the CSP that lets the admin frame your site. Drop it and the editor
  is an empty box with no error anywhere.
- `sitemap.xml` / `robots.txt` - one `<url>` per language.

## Why there is no `/cmssy-edit` route here

The Next adapter needs one because a Next page can be **static**, and a static
page never sees the query string that would put it in edit mode. React Router
renders on every request, so the editor is served from the page itself - verified
the same way, on the same protocol, with less machinery.

## Prove the editor works

```bash
pnpm build && pnpm start &
CMSSY_DRAFT_SECRET=… pnpm smoke:edit
```

A build proves the site compiles. It says nothing about whether the site can be
**edited** - and that is the part that breaks silently.
