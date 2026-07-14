# cmssy on Astro

A cmssy site that works, is editable, and proves it stays that way.

```bash
cp .env.example .env      # Settings → Headless in the cmssy dashboard
pnpm install && pnpm dev
```

## What is wired

- `src/middleware.ts` - the whole adapter: resolves the language, routes a
  **verified** editor request to `/cmssy-edit`, applies the CSP that lets the
  admin frame your site.
- `src/pages/[...path].astro` - the public page. React blocks rendered on the
  server, **zero client JS**.
- `src/pages/cmssy-edit/[...path].astro` - the editor route. **Delete it and the
  editor preview goes blank** while everything else keeps working - the single
  most common way to break a cmssy app.
- `sitemap.xml` / `robots.txt` - one `<url>` per language.

## Prove the editor works

```bash
pnpm build && pnpm start &
CMSSY_DRAFT_SECRET=… pnpm smoke:edit
```

A build proves the site compiles. It says nothing about whether the site can be
**edited** - and that is the part that breaks silently.

## Deploying

The starter uses the standalone Node adapter so `pnpm start` runs anywhere. Swap
in `@astrojs/vercel`, `@astrojs/netlify` or `@astrojs/cloudflare` to deploy.
