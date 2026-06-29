---
title: Authoring a block
description: Define a custom block with defineBlock and fields - the editor schema, the component contract, registration, and testing.
---

# Authoring a block

> Status: outline (CMS-772). APIs below are accurate; a complete worked example
> and testing walkthrough are still being filled in.

A block is a React component plus an editor schema. You define both with
`defineBlock` and register the result.

## defineBlock

```ts
import { defineBlock, fields } from "@cmssy/react";
import Component from "./Component";

export const heroBlock = defineBlock({
  type: "hero", // unique block type id
  label: "Hero",
  component: Component,
  props: {
    heading: fields.singleLine({ label: "Heading" }),
    showCta: fields.boolean({ label: "Show CTA", defaultValue: true }),
  },
  // optional: loader (see ./server-loaders.md)
});
```

## The `fields` registry

`fields` provides the editor controls: `singleLine`, `multiLine`, `richText`,
`boolean`, `select`, `numeric`, `link`, `repeater`, and more. Each takes a
`label` and control-specific options.

> TODO: full field-type table with options and the data shape each produces.

## The component contract

A block component receives:

- `content` - the resolved field values for the current locale.
- `context` - [`CmssyBlockContext`](#context): `locale`, `isPreview`, `forms`.
- `data` - the [server loader](./server-loaders.md) result, or `undefined` in the editor.

### Content defaults: render, don't fabricate

Do **not** default text/copy/media content props. If a heading is empty, render
nothing - never substitute placeholder copy. Empty-array guards (`items = []`)
and boolean/config defaults (`variant = "default"`) are fine.

```tsx
// good - empty content renders nothing
{
  heading && <h1>{heading}</h1>;
}
```

The CMS is the single source of truth for content; a component that invents
fallback text shows content the editor never wrote.

## Registration

Collect your blocks into one array and pass it to `createCmssyPage`. The editor
lazy-imports the registry on the client; keep server-only code in loaders (see
[Server loaders](./server-loaders.md)).

## Testing

> TODO: co-located `block.test.ts` with the `@cmssy/cli` test helpers; rendering
> a block with mock `content` and asserting against `data`.

## Conventions

- Kebab-case file names; PascalCase only for the component default export.
- Co-locate tests next to the source.
- One folder per block: `blocks/<name>/` with `block.ts` + `src/`.
