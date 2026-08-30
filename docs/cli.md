---
title: The cmssy CLI
description: cmssy init generates the cmssy wiring into an existing app; cmssy add block scaffolds and registers a new block; cmssy link connects the app to a workspace; cmssy types generates TypeScript for the workspace models, so a record is typed instead of unknown; cmssy sync-manifest pushes the block and layout manifest from the build.
---

# `cmssy init` (@cmssy/cli)

cmssy never scaffolds your app - the framework is an adapter, never the
foundation. You create the app with the framework's own CLI (`create-next-app`,
`create astro`, `create-react-router`), and `cmssy init` generates only the
cmssy wiring into it: the config, the block registry with an example block, the
catch-all page, the `/cmssy-edit` route, the draft route, the proxy/middleware
and `.env.example`.

```bash
npx create-next-app@latest my-site
cd my-site
npx @cmssy/cli init
cmssy init --dir ../my-site --force
```

## What it does

1. Detects the framework from the app's `package.json` dependencies - `next`,
   `astro`, or `react-router`. No supported framework is a loud failure with
   the create command for each one, never a guess.
2. Writes the wiring files for that framework. A file that already exists is
   skipped and reported as exactly that - `cmssy init` never deletes or
   overwrites anything unless you pass `--force`. Run it twice and the second
   run is a no-op.
3. Adds the missing `@cmssy/*` dependencies to `package.json`, caret-pinned to
   the CLI's own version (they release in lockstep). Dependencies you already
   have are left untouched. You run the install yourself - the hint names the
   package manager your lockfile says you use.
4. Wires the lint rules that catch what a build cannot - a provider the
   `/cmssy-edit` route never gets, and server config pulled into a client
   bundle. `@cmssy/eslint-plugin` goes into `devDependencies`, and the app's
   flat config gets `...cmssy.configs.recommended` appended to its default
   export; an app with eslint but no config gets an `eslint.config.mjs`
   written. Your config is never overwritten, and what it cannot edit (a legacy
   `.eslintrc`, a CommonJS config, no default export) is printed with the lines
   to paste. An app with no eslint at all gets the note, not a linter it did
   not ask for.
5. Prints what needs your attention: a conflicting `app/page.tsx` next to the
   catch-all or an `app/layout.tsx` that outranks the cmssy root layouts (Next),
   the `npx astro add react node` step (Astro), or an `app/routes.ts` or
   `app/root.tsx` it refused to overwrite (React Router).
6. Says what each file it wrote is for - one line under the file name - and ends
   with a **What not to break** list: the few things whose absence breaks the
   editor or the cache without failing a build. Since 11.7.0 the scaffolded files
   carry no comments of their own; that explanation is printed once, here, and
   the long version is [wiring](wiring.md).

Flags: `--dir <path>` targets an app outside the working directory; `--force`
overwrites existing wiring files.

## What it writes

| Framework      | Wiring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js        | `cmssy.config.ts`, `proxy.ts`, `services/pages.ts` (the delivery query and `publishedPaths()` for `generateStaticParams`), `cmssy/` (registry, editor, editable layout, site providers), `blocks/hero/`, `app/[[...path]]/` and `app/cmssy-edit/[[...path]]/` (page **and** layout - these are the root layouts, so the app has no `app/layout.tsx`), `app/api/draft/` - under `src/` when the app uses one, plus `eslint.config.mjs` when the app lints and has no config of its own. The layout slot itself is `CmssyLayoutSlot` from `@cmssy/next/server`, so no file is written for it. |
| Astro          | `src/cmssy.config.ts`, `src/middleware.ts`, `src/cmssy/`, `src/components/Blocks.tsx`, `src/pages/[...path].astro`, `src/pages/cmssy-edit/`.                                                                                                                                                                                                                                                                                                                                                      |
| React Router 7 | `cmssy.config.ts`, `app/root.tsx` (its `Layout` sets `<html lang>`), `app/routes.ts`, `app/cmssy/`, `app/routes/page.tsx`. No `/cmssy-edit` route - a React Router page always sees its query string.                                                                                                                                                                                                                                                                                             |

SEO (metadata, sitemap, robots) is deliberately not scaffolded: since 10.0 it is
the app's own query plus its own transformation. The
[simple-blog example](https://github.com/cmssy-io/examples/tree/main/simple-blog) has a working version
to copy.

Then add your blocks and connect the app to a workspace:

# `cmssy add block` (@cmssy/cli)

Every block after the generated `hero` used to mean hand-copying its files and
remembering the registry edit. `cmssy add block <name>` scaffolds the next
block the same way `init` scaffolded the first one: the schema, the component,
and the registration - already wired, compiling, and visible to the editor on
the next dev-server start.

```bash
cmssy add block pricing-table
cmssy add block faq-list --dir ../my-site
```

## What it does

1. Detects the framework the same way `init` does and derives every name from
   the kebab-case block name: `pricing-table` becomes type `pricing-table`,
   label `Pricing Table`, component `PricingTable`, and export
   `pricingTableBlock`.
2. Writes the block files for that framework - Next.js gets
   `blocks/pricing-table/block.ts` + `blocks/pricing-table/PricingTable.tsx`
   (under `src/` when the app uses one); Astro and React Router get a single
   `cmssy/pricing-table.tsx` next to the registry.
3. Registers the block in `cmssy/blocks.ts`: adds the import and appends it to
   the `blocks` array (plus the `defineBlock` call on Astro/React Router, where
   the definition lives in the registry). Your formatting and existing entries
   are preserved.
4. Refuses to touch anything ambiguous: an invalid name, a block that is
   already registered, existing files, or a registry without an
   `export const blocks = [...]` array are loud failures with the manual step
   spelled out - never a silent partial write.

The generated block starts with a required `heading` text field and an optional
`text` textarea - edit the props and markup, restart the dev server, and the
editor picks the new type up from the manifest handshake.

Flags: `--dir <path>` targets an app outside the working directory.

# `cmssy link` (@cmssy/cli)

Connecting an app to a workspace used to mean hand-copying five values between
the dashboard and `.env.local` - and the editor stayed dead until every one of
them was right. `cmssy link` does the copying for you and then proves the
wiring works.

```bash
npx @cmssy/cli link
cmssy link --token cs_... --workspace acme/shop --preview-url https://shop.example.com
```

## What it does

1. Authenticates with a cmssy API token - from `--token` or the
   `CMSSY_API_TOKEN` environment variable (`.env.local` and `.env` are read
   first, never overwriting variables already set in your shell).
2. Lists the token user's workspaces and selects one: `--workspace <slug>` (or
   `<org>/<slug>`) non-interactively, an interactive picker on a terminal, or
   automatically when there is exactly one.
3. Reads the workspace's draft secret (the token's user needs the
   `PAGES_EDIT` permission - a missing permission is reported as exactly
   that).
4. Sets the workspace preview URL - the origin the editor frames your app at
   for EVERYONE in the workspace - only when `--preview-url` names your
   deployed site. A localhost value is rejected: for local development, toggle
   dev mode in the cmssy editor and enter your local host there - that target
   is per user and touches nothing shared. Without the flag the value is left
   unchanged.
5. Writes `CMSSY_ORG_SLUG`, `CMSSY_WORKSPACE_SLUG` and `CMSSY_DRAFT_SECRET`
   into `.env.local`, merging with what is already there - existing lines,
   comments and unrelated variables are preserved.
6. Runs the preflight checks and prints one line per check.
7. Prints the editor deep link and, when the workspace has a preview URL, a ready-to-open draft preview link.

Every failure prints a concrete fix instruction, never a stacktrace.

## The checks

| Check               | What it verifies                                                                                                                                                                                                                            | On failure                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Workspace reachable | `public.siteConfig` answers for the linked org + workspace - the slugs exist and the delivery API is up.                                                                                                                                    | Distinguishes wrong slugs, network problems, and a workspace over its delivery limit.                                          |
| Draft secret        | The backend confirms the written secret matches the workspace (`public.draftSecretValid`).                                                                                                                                                  | Tells you to copy the secret from Settings → Headless. On a platform without the field yet, reports `?` unknown and continues. |
| Editor deep link    | Always printed: `https://www.cmssy.io/dashboard/organizations/{org}/workspaces/{workspace}/editor`.                                                                                                                                         | -                                                                                                                              |
| Draft preview link  | Printed when the workspace reports a preview URL: `{previewUrl}/api/draft?secret=...&redirect=/` opens the site in draft mode without the editor; the same `/api/draft` path works on a local dev server. Exit with `/api/draft?disable=1`. | Skipped when no preview URL is set.                                                                                            |

## Example output

```
$ cmssy link --token cs_... --workspace acme/shop
✓ linking to Shop (acme/shop)
✓ fetched the draft secret
? preview URL left unchanged - pass --preview-url <deployed origin> to set it; for localhost use the editor dev-mode switch
✓ wrote CMSSY_ORG_SLUG, CMSSY_WORKSPACE_SLUG and CMSSY_DRAFT_SECRET to .env.local
✓ workspace acme/shop is reachable
✓ the draft secret is valid

Edit this site visually:
  https://www.cmssy.io/dashboard/organizations/acme/workspaces/shop/editor

Preview drafts without the editor (the /api/draft path also works on your local dev server):
  https://shop.example.com/api/draft?secret=...&redirect=%2F
  exit draft mode: https://shop.example.com/api/draft?disable=1
```

Statuses:

- `✓` - verified.
- `✗` - broken, with the fix on the next line. Exit code 1.
- `?` - could not be verified (for example, the platform does not support
  draft secret verification yet). Never blocks.

## The preflight is also an API

Every check is a pure function in `@cmssy/core`, exposed under the
`@cmssy/core/preflight` subpath so dev tooling never enters your production
bundle. Each returns `{ status: "ok" | "fail" | "unknown", message, fix? }`:

```ts
import {
  checkWorkspaceReachable,
  checkDraftSecret,
  checkPreviewUrl,
  checkFrameAncestors,
  buildEditorUrl,
} from "@cmssy/core/preflight";
```

`checkWorkspaceReachable` and `checkDraftSecret` talk to the delivery API;
`checkPreviewUrl`, `checkFrameAncestors` and `buildEditorUrl` are pure string
logic. None of them import a framework or a Node built-in.

## What you see when wiring is broken

In development the same checks guard the edit route itself. An editor request
that fails verification (`cmssyEdit=1` with a wrong or missing `cmssySecret`)
does not 404: the adapter renders a diagnostics page inside the editor iframe
instead, one line per check - missing env vars (and where to get them), an
unreachable workspace, a draft secret mismatch (phrased as "could not verify
against the platform" when the platform cannot confirm it), plus the preview
URL comparison and the origins `frame-ancestors` must allow. The page shows the
workspace slug and which check failed, never a secret value. In production the
edit route keeps serving a 404, exactly as before.

# `cmssy types` (@cmssy/cli)

A model record comes over the wire as a JSON blob, so without this every read is
`unknown` and every field access is a hand-written cast - `str(data.title)`,
`data.specs as Specs`. The CMS already knows the shape. This makes it say so:

```bash
npx @cmssy/cli types                  # cmssy/models.ts + cmssy/operations.graphql
npx @cmssy/cli types --out types/cms.ts
npx @cmssy/cli types --no-operations  # no codegen in this app
```

It reads the workspace's model definitions over the **public** delivery path -
the same `CMSSY_ORG_SLUG` / `CMSSY_WORKSPACE_SLUG` your app uses, loaded from
`.env.local` / `.env` like `cmssy link` does. No API token, so it runs in CI.

Flags: `--out <path>` moves the models file; `--operations-out <path>` moves the
operations file; `--no-operations` skips it entirely; `--check` writes nothing and
exits non-zero when either file is out of date; `--org <slug>` and
`--workspace <slug>` override what the env files say.

For a `product` model it writes:

```ts
export interface ProductData {
  /** Title */
  title: CmssyLocalized;
  slug: string;
  price: number;
  /** Unit */
  unit?: "pcs" | "set" | "m" | "kg" | "pair";
  /** Category - Record id(s) from `category`. */
  category?: string;
  specs?: { material?: string; weightKg?: number };
}

export type ProductRecord = CmssyRecordOf<ProductData>;
export interface CmssyModels {
  product: ProductData; /* … */
}
```

What the mapping preserves, and what a hand-written type usually loses:

- **Required** fields are non-optional; everything else is `?`.
- **Localized** fields are `CmssyLocalized` (`string | Record<string, string>`),
  which is what the API actually returns once a workspace has two languages -
  the single most common source of `[object Object]` on a page.
- **select / radio / multiselect** become the union of the configured options,
  so a typo in a filter is a compile error.
- **relation** is typed as the record id(s) it stores, with the target model
  named in the doc comment.
- **object** and **repeater** fields are inlined, nested fields and all.
- Hidden fields are left out; models are emitted in slug order, so re-running
  the command produces no diff unless the CMS changed.

## The delivery operations

The same command vendors `cmssy/operations.graphql`: the delivery reads every
cmssy app performs, as `.graphql` documents your own codegen types like any
other file.

```text
PublicSiteConfig   PublicPage        PublicPageById    PublicPages
PublicPageMeta     PublicPageLayouts PublicModelRecords
PublicRecordsByIds PublicForm        SubmitForm
```

**Point your codegen at it, or nothing reads it.** The generated file lives
outside the `graphql/` tree most apps glob:

```ts
// codegen.ts
documents: ["graphql/**/*.graphql", "cmssy/**/*.graphql"],
```

These are not a template the CLI carries - they are the constants `@cmssy/core`
itself queries with, exported and written out. A CLI-side copy would be one more
place for the shape to drift from the client that uses it, which is the problem
this solves rather than repeats.

**Two operations are deliberately absent, and adding them breaks apps.** The
dev-preview variant of `PublicPage` is a second document with the same operation
name, and graphql-codegen's client preset rejects a duplicate name outright - the
file would fail every consumer's codegen. `PublicModelDefinitions` is what
`cmssy types` itself reads to write `models.ts`; an app has no reason to fetch
model definitions at runtime.

**The file is vendored, not yours.** Every run rewrites it, so editing it is
pointless rather than dangerous. Need a different selection set? Write your own
query under your own operation name.

**Already have your own copies?** An app that hand-wrote `PublicSiteConfig` and
friends will get a refusal naming the file, not a broken build:

```
cmssy: cmssy/operations.graphql would collide with operations this app already declares
  PublicSiteConfig - already in graphql/query/site-config.graphql
  delete those documents to use the vendored ones, or pass --no-operations to keep yours
```

Two documents cannot share an operation name in graphql-codegen's client preset,
so the choice is yours to make deliberately: delete your copies, or keep them and
skip the vendored file.

**`PublicPagesByType` is deliberately absent.** Every app that has one selects
different fields and different variables, and the SDK has no version of it -
generating one would mean inventing it. That query is yours.

The operations need no workspace and no network, so they are written before the
model half runs and land even in a repo that is not linked yet - though the
command still exits non-zero in that case, because the models half failed.
`--check` covers the file exactly as it covers the models.

Use the models with the vendored document:

```ts
const data = await client.queryScoped<{
  public: { model: { records: CmssyRecordList<"product"> } };
}>(PRODUCTS_QUERY, { modelSlug: "product", limit: 24 });

for (const record of data.public.model.records.items) {
  record.data.price; // number, not unknown
}
```

Commit the generated file and re-run the command after changing a model in the
CMS - a field you removed there becomes a compile error here, which is the whole
point.

# `cmssy sync-manifest` (@cmssy/cli)

The editor learns which blocks, layout regions and region settings your site
declares from the `cmssy:ready` handshake - which fires only when someone opens
the editor canvas. A deploy that adds a region or a setting is invisible in
`/layouts` until then. This command sends the same manifest from the build:

```bash
npx @cmssy/cli sync-manifest
cmssy sync-manifest --dry-run          # print the manifest, push nothing
cmssy sync-manifest --blocks lib/registry.ts --config lib/site.ts
```

Wire it as the `postbuild` step, and set `CMSSY_API_TOKEN` in the deploy
environment:

```json
{
  "scripts": {
    "build": "next build",
    "postbuild": "cmssy sync-manifest"
  }
}
```

## What it does

1. Loads `.env.local` and `.env` like the other commands, then compiles and
   imports the app's own block registry (`cmssy/blocks.ts`, or `src/` / `app/`
   variants) and config (`cmssy.config.ts`) - the same modules the app renders
   from, TypeScript, JSX, path aliases and all. Stylesheets and asset imports
   are dropped; `server-only` is honoured. `--blocks` and `--config` name the
   files when they live elsewhere.
2. Serializes them with the functions the handshake itself uses -
   `blocksToSchemas`, `blocksToMeta` and `layoutRegionsToBridge` from
   `@cmssy/core`, folded by `buildBlockManifest`. There is no CLI-side copy
   of the shape to drift: the same input yields byte for byte the manifest an
   open editor would have pushed.
3. Resolves the workspace from `--org` / `--workspace`, else the config's
   `org` and `workspaceSlug`, else `CMSSY_ORG_SLUG` / `CMSSY_WORKSPACE_SLUG`,
   and confirms the token's user is a member of it.
4. Calls `blockManifest.save` with the token. The token's user needs the
   `PAGES_EDIT` permission in that workspace. The backend hashes the manifest
   and skips the write when it is unchanged, so running the command on every
   deploy is free.

Every failure is one line with a fix under it, and a non-zero exit: no token,
no workspace, a workspace the token cannot reach, a registry without an
`export const blocks` array, a config whose `layout` is not a
`defineCmssyLayout()` result, a compile error with its file and line, or the
backend's own validation message when it refuses the manifest.

The config is evaluated for real, so `defineCmssyConfig` sees the same
environment the build does - a missing `CMSSY_DRAFT_SECRET` fails here the way
it fails the build.

A site whose config declares no `layout` sends `regions: null`, and the
backend keeps whatever regions it already stores - the same thing an open
editor sends for that site. A push whose hash the workspace already holds is
reported as unchanged.

The command talks to the **admin** API - `https://api.cmssy.io/graphql` by
default, `CMSSY_API_URL` to override (self-hosted, staging). That is the same
endpoint `cmssy link` uses and needs the token; it is not the per-workspace
delivery path (`/public/<org>/<workspace>/graphql`) the quickstart's `apiUrl`
and `cmssy types` read from without one.

Flags: `--blocks <path>` and `--config <path>` name the modules, relative to
the working directory or absolute; `--token <cs_...>` overrides
`CMSSY_API_TOKEN`; `--org <slug>` and `--workspace <slug>` override the config
and the env; `--dry-run` prints the manifest as JSON and sends nothing;
`--help` prints the usage. A flag given without a value is an error, never a
silent fallback.
