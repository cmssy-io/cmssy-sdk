---
title: Authoring a block
description: Define a custom block with defineBlock and fields - the editor schema, the component contract, registration, and testing.
---

# Authoring a block

A block is a React component plus an editor schema. You define both with
`defineBlock`, then register the result so pages and the editor can use it.

**The schema types the component.** Declare the fields once and derive the
component's `content` from them with `BlockProps<typeof props>`. Nothing else
knows a field's name, so a rename breaks the build instead of silently rendering
an empty block.

```tsx
// Hero.tsx - the schema lives next to the component that reads it
import { fields, type BlockProps } from "@cmssy/react";

export const heroProps = {
  heading: fields.text({ label: "Heading", required: true }),
  showCta: fields.boolean({ label: "Show CTA", defaultValue: true }),
};

export default function Hero({ content }: BlockProps<typeof heroProps>) {
  // content.heading is string (required), content.showCta is boolean | undefined
  return (
    <section>
      <h1>{content.heading}</h1>
      {content.showCta && <a href="/signup">Get started</a>}
    </section>
  );
}
```

```ts
// block.ts
import { defineBlock } from "@cmssy/react";
import Hero, { heroProps } from "./Hero";

export const heroBlock = defineBlock({
  type: "hero", // unique id, stored on every instance
  label: "Hero", // shown in the editor's block list
  component: Hero,
  props: heroProps,
  // optional, server-only data fetching - see ./server-loaders.md
  // loader: async ({ content, context }) => ({ ... }),
});
```

Retyping `content` by hand next to the schema is now a compile error:
`defineBlock` rejects a component whose `content` disagrees with the fields the
schema declares.

Full shape:

| Key               | Required | Purpose                                                                       |
| ----------------- | -------- | ----------------------------------------------------------------------------- |
| `type`            | yes      | Unique block-type id. Stored on each instance.                                |
| `component`       | yes      | The React component that renders the block.                                   |
| `props`           | yes      | The editor schema - a map of field name → field control.                      |
| `label`           | no       | Display name in the editor.                                                   |
| `category`        | no       | Groups the block in the editor's picker.                                      |
| `icon`            | no       | Icon id for the picker.                                                       |
| `layoutPositions` | no       | Restrict where the block may be placed.                                       |
| `loader`          | no       | Server-side data fetch (SSR only). See [Server loaders](./server-loaders.md). |

## The `fields` registry

`fields` provides the editor controls. Each returns a field definition that
carries the type of the value it holds, which is what lets `content` be derived
from the schema:

| Control               | Editor input              | `content` type            | Notable options                                                  |
| --------------------- | ------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `fields.text`         | One-line text             | `string`                  | `defaultValue`, `placeholder`, `required`                        |
| `fields.textarea`     | Multi-line text           | `string`                  | `defaultValue`, `placeholder`                                    |
| `fields.richText`     | Rich text (HTML)          | `string`                  | `required`                                                       |
| `fields.markdown`     | Markdown                  | `string`                  | `required`                                                       |
| `fields.number`       | Number                    | `number`                  | `defaultValue`                                                   |
| `fields.boolean`      | Toggle                    | `boolean`                 | `defaultValue`                                                   |
| `fields.date`         | Date picker               | `string`                  | `defaultValue`                                                   |
| `fields.media`        | Media picker (image/file) | `string`, `string[]`      | `multiple`, `acceptedTypes`, `maxSize`                           |
| `fields.link`         | Internal/external link    | `string`                  | -                                                                |
| `fields.url`          | URL                       | `string`                  | `required`                                                       |
| `fields.select`       | Single choice             | union of its `options`    | `options`, `defaultValue`                                        |
| `fields.radio`        | Single choice (radios)    | union of its `options`    | `options`                                                        |
| `fields.multiselect`  | Multiple choice           | array of its `options`    | `options`                                                        |
| `fields.color`        | Color picker              | `string`                  | `defaultValue`                                                   |
| `fields.repeater`     | Repeatable group          | array of its `itemSchema` | `itemSchema`, `itemLabel`, `minItems`, `maxItems`, `collapsible` |
| `fields.pageSelector` | Page picker               | `PageRef[]`               | `pageType`, `multiple`                                           |
| `fields.json`         | JSON                      | `JsonValue`               | -                                                                |

Every control accepts `label`, `helperText`, and `required`.

`required: true` makes the key required in `content`. Everything else is
optional - the editor lets an author leave a field empty, and the type says so.

```ts
export const cardProps = {
  badge: fields.text({ label: "Badge", placeholder: "New" }),
  size: fields.select({
    label: "Size",
    defaultValue: "md",
    options: ["sm", "md", "lg"],
  }),
  features: fields.repeater({
    label: "Features",
    itemSchema: {
      title: fields.text({ label: "Title", required: true }),
      icon: fields.media({ label: "Icon" }),
    },
  }),
};

// content.badge    → string | undefined
// content.size     → "sm" | "md" | "lg" | undefined   (not just `string`)
// content.features → { title: string; icon?: string }[] | undefined
```

## The component contract

A block component receives three props, all of them typed by
`BlockProps<typeof props>`:

- `content` - the resolved field values for the current locale, typed by the schema.
- `context` - `CmssyBlockContext`: `locale`, `isPreview`, `forms`, and (when configured) `auth` and `workspace`. See [Member auth](../auth/member-auth.md) for `context.auth`.
- `data` - the [server loader](./server-loaders.md) result, or `undefined` in the editor. Pass the loader's type as the second parameter: `BlockProps<typeof props, Posts>`.

```tsx
import { fields, type BlockProps } from "@cmssy/react";

export const heroProps = {
  heading: fields.text({ label: "Heading" }),
  showCta: fields.boolean({ label: "Show CTA", defaultValue: true }),
};

function Hero({ content, context }: BlockProps<typeof heroProps>) {
  const { heading, showCta = true } = content;
  return (
    <section lang={context?.locale.current}>
      {heading && <h1>{heading}</h1>}
      {showCta && <a href="/signup">Get started</a>}
    </section>
  );
}
```

### Content defaults: render, don't fabricate

Do **not** default text, copy, or media content props. If a heading is empty,
render nothing - never substitute placeholder copy.

```tsx
// bad - invents content the editor never wrote
const { heading = "Building the future" } = content;

// good - empty content renders nothing
return <>{heading && <h1>{heading}</h1>}</>;
```

Empty-array guards (`items = []`) and boolean/config defaults
(`showCta = true`, `variant = "default"`) are fine - they are behaviour, not
content. The CMS is the single source of truth for content.

## Registration

Collect your blocks into one array and pass it to `createCmssyPage`:

```ts
// cmssy/blocks.ts
import { heroBlock } from "@/blocks/hero/block";
import { pricingBlock } from "@/blocks/pricing/block";

export const blocks = [heroBlock, pricingBlock];
```

```tsx
// app/[[...path]]/page.tsx
import { createCmssyPage } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";

export default createCmssyPage(cmssy, blocks);
```

The editor lazy-imports this registry on the client, so keep server-only code in
a [loader](./server-loaders.md), not at the top of the block module.

## Testing

Co-locate a test next to the block and render the component with mock `content`:

```tsx
// blocks/hero/Hero.test.tsx
import { render, screen } from "@testing-library/react";
import Hero from "./Hero";

test("renders the heading when set", () => {
  render(<Hero content={{ heading: "Hello" }} />);
  // getByRole throws if absent, so this asserts the heading rendered
  expect(screen.getByRole("heading", { name: "Hello" })).toBeTruthy();
});

test("renders nothing for an empty heading", () => {
  const { container } = render(<Hero content={{}} />);
  expect(container.querySelector("h1")).toBeNull();
});
```

Run them with your project's test runner (Vitest or Jest) and a React testing
environment. The assertions above use only built-in matchers, so no
`@testing-library/jest-dom` setup is needed.

## Conventions

- Kebab-case file names; PascalCase only for the component default export.
- One folder per block: `blocks/<name>/` with `block.ts` + the component.
- Co-locate tests next to the source.
