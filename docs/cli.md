---
title: cmssy link
description: Connect an app to a cmssy workspace with one command - the CLI fetches the slugs and the draft secret, writes .env.local, sets the preview URL and verifies the wiring.
---

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
7. Prints the editor deep link.

Every failure prints a concrete fix instruction, never a stacktrace.

## The checks

| Check               | What it verifies                                                                                         | On failure                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Workspace reachable | `public.siteConfig` answers for the linked org + workspace - the slugs exist and the delivery API is up. | Distinguishes wrong slugs, network problems, and a workspace over its delivery limit.                                          |
| Draft secret        | The backend confirms the written secret matches the workspace (`public.draftSecretValid`).               | Tells you to copy the secret from Settings → Headless. On a platform without the field yet, reports `?` unknown and continues. |
| Editor deep link    | Always printed: `https://www.cmssy.io/dashboard/organizations/{org}/workspaces/{workspace}/editor`.      | -                                                                                                                              |

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
