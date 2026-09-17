---
title: Renaming or removing blocks safely
description: What happens to stored content when a block type, field or layout region leaves your code, how cmssy sync-manifest reports it before the push, and the order of steps that keeps a live site intact.
---

# Renaming or removing blocks safely

Your block registry lives in code, but the content lives in cmssy. When a block
type, a field or a layout region leaves the code, the stored content that uses
it does not go anywhere. The workspace's **block manifest** tells cmssy which
blocks exist. The delivery API uses it to resolve media, and it decides where
field values are stored (shared, per tab, per locale).

## Check before you push

`cmssy sync-manifest` compares the manifest your build produces with the one
the workspace holds, and prints the effect on stored content before it pushes:

```
$ cmssy sync-manifest --dry-run
cmssy: dry run - pushing 11 blocks to acme/shop would change: (cmssy/blocks.ts, cmssy.config.ts)
  removes `testimonials`, used on 14 pages (3 published)
  removes fields from `hero`: subtitle
  reshapes `pricing` - stored values may no longer match its fields
  adds `quote`
  moves 6 stored values in 2 documents
  2 moves would drop stored values (a translation or a differing copy) in 1 document
cmssy: not pushed - rerun with --allow-lossy to accept dropping those values
```

- **Removed types and fields only warn.** The push still happens and the
  command exits 0. Blocks of a removed type stay stored, but the site no
  longer renders them and the delivery API stops resolving their media.
- **A move that would drop a value stops the push** and exits 1, including on
  `--dry-run`. This happens when a field becomes shared or moves to another
  tab and the stored copies disagree, or when a translation would be lost.
  Rerun with `--allow-lossy` once you have checked the pages it names.
- The push is compare-and-swap: if the workspace's manifest changed between
  the check and the push, nothing is written and the command asks you to run
  it again.

The `list_block_usage` MCP tool (and `blockManifest.usage` in the admin API)
lists, per type, the pages that store it and whether they are drafts,
published pages, layouts or dev drafts.

## Removing a block type

1. Run `list_block_usage` for the type, or `cmssy sync-manifest --dry-run`
   with the block removed, to see which pages use it.
2. Remove or replace those blocks on the pages, and publish them.
3. Remove the block from the code and deploy. `sync-manifest` should now say
   the type is not used on any page.

## Renaming a block type

A block's `type` is its stored identity. Renaming it in code is a removal plus
an addition: existing blocks keep the old `type`, and nothing maps them to the
new one. Keep the old `type` string and change only the `label`. That is safe
and changes nothing stored.

## Renaming or retyping a field

Stored content keeps the old key and the old value shape. Add the new field
next to the old one, move the values over (in the editor, or with the MCP
`patch_block_content` tool), then remove the old field.

## Editor pushes

An editor session sends the manifest of the site it frames. It activates only
changes that add things. Anything that removes a type, a field or a region, or
moves stored content, is kept as a **proposal**. A member with the
`site:manifest:manage` permission reviews the proposal and activates it under
Settings → Headless → Block manifest. The same card can roll back to the
previous manifest.
