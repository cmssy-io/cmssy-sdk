---
title: Migrating to SDK 8
description: A block's content is now typed by its field schema - what breaks, and the two-line fix per block.
---

# Migrating to SDK 8

**Run this first:**

```bash
npx @cmssy/codemod v8 .
```

It drops the explicit type arguments `defineBlock` no longer needs, and prints
the list of blocks you must retype by hand - see below. It does not touch your
components, because it cannot: only you know which fields a component means to
read.

## What changed, and why

A block had **two sources of truth about its own fields**: the schema in
`props`, and the `content` type written by hand next to the component. Nothing
kept them in sync.

```ts
// blocks/hero/block.ts
props: {
  headline: fields.text({ required: true });
}

// blocks/hero/Hero.tsx - never updated after the rename
export interface HeroContent {
  heading?: string;
}
```

That compiled. `tsc --noEmit` exited 0. The block rendered **empty** - in the
editor and in production - and nothing anywhere said why.

In 8.0 the fields carry their own value type, and `defineBlock` derives the
component's `content` from the schema. The schema is now the only place a field
is named.

## The fix, per block

Declare the schema once, export it, and type the component from it.

```tsx
// Hero.tsx
import { fields, type BlockProps } from "@cmssy/react";

export const heroProps = {
  heading: fields.text({ label: "Heading", required: true }),
  text: fields.textarea({ label: "Text" }),
};

export default function Hero({ content }: BlockProps<typeof heroProps>) {
  return <h1>{content.heading}</h1>;
}
```

```ts
// block.ts
import { defineBlock } from "@cmssy/react";
import Hero, { heroProps } from "./Hero";

export const heroBlock = defineBlock({
  type: "hero",
  label: "Hero",
  component: Hero,
  props: heroProps,
});
```

Delete the hand-written `HeroContent`. If it disagreed with the schema, the
build now says so instead of shipping an empty block.

## What the types give you

| Schema                                     | `content`                    |
| ------------------------------------------ | ---------------------------- |
| `fields.text({ required: true })`          | `string` - a required key    |
| `fields.text()`                            | `string \| undefined`        |
| `fields.number()`                          | `number \| undefined`        |
| `fields.select({ options: ["sm", "md"] })` | `"sm" \| "md" \| undefined`  |
| `fields.media({ multiple: true })`         | `string[] \| undefined`      |
| `fields.repeater({ itemSchema: { … } })`   | the row's shape, as an array |

## Errors you may see

**`CONTENT_MUST_BE_TYPED_AS_BlockProps_OF_THIS_PROPS`**

The component's `content` disagrees with the schema about a field the schema
declares - a rename, a typo, or `Record<string, unknown>`. The error shows the
content the schema describes. Type the component with
`BlockProps<typeof props>` and the error goes away.

**`Property 'heading' does not exist on type '{ headline: string }'`**

Exactly the bug this release exists to catch: the schema and the component
disagree on a field name. One of them is wrong - now you get to find out which
one before an author does.

## Content a loader injects

A component may read content the editor never asks for - a product fetched by a
server loader, for example. Extra keys are still allowed; only the fields the
schema **declares** are checked:

```tsx
interface ProductBlockProps extends BlockProps<typeof productProps> {
  content: BlockProps<typeof productProps>["content"] & {
    product?: CmssyProduct;
  };
}
```

## Also in 8.0

- `defineBlock<Content, Data>` no longer takes explicit type arguments - both are
  inferred. The codemod removes them.
- The field-inference types live in `@cmssy/types` 0.28, next to the field
  definitions they derive from. You do not import them directly;
  `BlockProps` from `@cmssy/react` is the one you use.
