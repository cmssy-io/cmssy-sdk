# Migrating to v9

One breaking change: **`CmssyConfig` no longer accepts `defaultLocale` and
`enabledLocales`.** The workspace site config (Settings → Languages in the
cmssy dashboard) is the only source of truth for the default and enabled
languages.

```bash
npx @cmssy/codemod v9 .
```

The codemod removes the two keys from your `defineCmssyConfig({...})` (or
`: CmssyConfig = {...}`) literal and prints what it removed.

## Why they had to go

The two fields duplicated the workspace's `defaultLanguage` /
`enabledLanguages` - and the SDK honored them inconsistently. The sitemap,
`buildCmssyMetadata` and the Next locale middleware read the config override;
the page router (`createCmssyPage`, `getCmssyLocale`, the Astro middleware)
always used the workspace values. Set `defaultLocale: "en"` in a workspace
whose default is `pl` and your sitemap disagreed with your routing - silently.

## Do I have to do anything besides the codemod?

Only if the removed value **disagreed** with the workspace:

- If your config said `defaultLocale: "en"` and the workspace default is also
  `en` - nothing changes.
- If they disagreed, the workspace value now wins everywhere. Check
  **Settings → Languages** and set the default and enabled languages you
  actually want; routing, sitemap and hreflang all follow it.

`resolveLocale` is unchanged: it remains the fallback for a site whose URLs
carry no language (cookie / Accept-Language strategies).

## Not affected

`defaultLocale` / `enabledLocales` **props** on components
(`CmssyServerPage`, editors) and the values returned by `resolveSiteLocales`
keep their names - those are the workspace values flowing through, not the
removed config override.
