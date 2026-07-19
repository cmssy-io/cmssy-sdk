---
title: The cmssy CLI
description: cmssy init generates the cmssy wiring into an existing app; cmssy add block scaffolds and registers a new block; cmssy link connects the app to a workspace - fetches the slugs and the draft secret, writes .env.local, sets the preview URL and verifies the wiring.
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
4. Prints what needs your attention: a conflicting `app/page.tsx` next to the
   catch-all (Next), the `npx astro add react node` step (Astro), or an
   `app/routes.ts` it refused to overwrite (React Router).

Flags: `--dir <path>` targets an app outside the working directory; `--force`
overwrites existing wiring files.

## What it writes

| Framework      | Wiring                                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js        | `cmssy.config.ts`, `proxy.ts`, `cmssy/` (registry, editor, editable layout), `blocks/hero/`, `app/[[...path]]/`, `app/cmssy-edit/[[...path]]/`, `app/api/draft/`, `app/robots.ts`, `app/sitemap.ts` - under `src/` when the app uses one. |
| Astro          | `src/cmssy.config.ts`, `src/middleware.ts`, `src/cmssy/`, `src/components/Blocks.tsx`, `src/pages/[...path].astro`, `src/pages/cmssy-edit/`, robots + sitemap.                                                                            |
| React Router 7 | `cmssy.config.ts`, `app/routes.ts`, `app/cmssy/`, `app/routes/page.tsx`, robots + sitemap. No `/cmssy-edit` route - a React Router page always sees its query string.                                                                     |

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
