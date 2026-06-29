---
title: Authoring a block
description: Define a custom block with defineBlock and fields - the editor schema, the component contract, registration, and testing.
---

# Authoring a block

A block is a React component plus an editor schema. You define both with
`defineBlock`, then register the result so pages and the editor can use it.

## defineBlock

```ts
import { defineBlock, fields } from "@cmssy/react";
import Hero from "./Hero";

export const heroBlock = defineBlock({
  type: "hero", // unique id, stored on every instance
  label: "Hero", // shown in the editor's block list
  component: Hero,
  props: {
    heading: fields.singleLine({ label: "Heading" }),
    showCta: fields.boolean({ label: "Show CTA", defaultValue: true }),
  },
  // optional, server-only data fetching - see ./server-loaders.md
  // loader: async ({ content, context }) => ({ ... }),
});
```

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

`fields` provides the editor controls. Each returns a field definition from a
single options object:

| Control              | Editor input              | Notable options                                                  |
| -------------------- | ------------------------- | ---------------------------------------------------------------- |
| `fields.singleLine`  | One-line text             | `defaultValue`, `placeholder`, `required`                        |
| `fields.multiLine`   | Multi-line text           | `defaultValue`, `placeholder`                                    |
| `fields.richText`    | Rich text (HTML)          | `required`                                                       |
| `fields.numeric`     | Number                    | `defaultValue`                                                   |
| `fields.date`        | Date picker               | `defaultValue`                                                   |
| `fields.media`       | Media picker (image/file) | -                                                                |
| `fields.link`        | Internal/external link    | -                                                                |
| `fields.select`      | Single choice             | `options: string[]`, `defaultValue`                              |
| `fields.multiselect` | Multiple choice           | `options: string[]`                                              |
| `fields.boolean`     | Toggle                    | `defaultValue`                                                   |
| `fields.color`       | Color picker              | `defaultValue`                                                   |
| `fields.repeater`    | Repeatable group          | `itemSchema`, `itemLabel`, `minItems`, `maxItems`, `collapsible` |

Every control accepts `label`, `helperText`, and `required`.

```ts
props: {
  badge: fields.singleLine({ label: "Badge", placeholder: "New" }),
  size: fields.select({ label: "Size", defaultValue: "md", options: ["sm", "md", "lg"] }),
  features: fields.repeater({
    label: "Features",
    itemSchema: {
      title: fields.singleLine({ label: "Title", required: true }),
      icon: fields.media({ label: "Icon" }),
    },
  }),
}
```

## The component contract

A block component receives three props:

- `content` - the resolved field values for the current locale.
- `context` - `CmssyBlockContext`: `locale`, `isPreview`, `forms`.
- `data` - the [server loader](./server-loaders.md) result, or `undefined` in the editor.

```tsx
function Hero({
  content,
}: {
  content: { heading?: string; showCta?: boolean };
}) {
  const { heading, showCta = true } = content;
  return (
    <section>
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
import { createCmssyPage } from "@cmssy/next";
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
  expect(screen.getByText("Hello")).toBeInTheDocument();
});

test("renders nothing for an empty heading", () => {
  const { container } = render(<Hero content={{}} />);
  expect(container.querySelector("h1")).toBeNull();
});
```

Run blocks through the cmssy CLI test runner with `cmssy test`.

## Conventions

- Kebab-case file names; PascalCase only for the component default export.
- One folder per block: `blocks/<name>/` with `block.ts` + the component.
- Co-locate tests next to the source.
