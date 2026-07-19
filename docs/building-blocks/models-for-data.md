---
title: Models for data, blocks for view
description: Structured content lives in workspace models and reaches a block through fields.relation - never as a repeater of records in block props. The full pattern, the relation field reference, and an end-to-end testimonials example.
---

# Models for data, blocks for view

cmssy splits a page's content into two layers with two different owners:

- **Data is CMS-first.** Structured, reusable content - testimonials, FAQ
  items, team members, offices - lives in workspace **models** and their
  **records**. Editors (or AI over MCP) create the model, add records, reorder
  and translate them, without a deploy.
- **View is code-first.** A **block** is a typed React component in your repo.
  Its `props` schema holds what belongs to the view: copy, variants, layout
  switches - and **references** to data via `fields.relation`.

The bridge is `fields.relation`: the block's schema declares _which model it
renders_, and the SDK hands the component fully-resolved records at render
time. The block ships on deploy; the records change whenever an editor saves.

**The anti-pattern: a collection of records inside a repeater.** A
`fields.repeater` holding `{ quote, author, role }` items looks quicker, but
it traps the data inside one block instance on one page. It cannot be reused
on another page, queried, sorted, or referenced - and every copy drifts on its
own. Reach for a repeater only for view-local structure (a list of feature
bullets that exists nowhere else); the moment items are _content with an
identity_ - things you would add, translate, or reuse independently of this
page - they are records of a model.

## `fields.relation`

```ts
fields.relation({
  label: "Testimonials",
  model: "testimonial", // the model's slug (required)
  mode: "all", // bind every record of the model; omit for editor-picked
  sort: "order_asc", // passed through to the delivery API; cmssy accepts <fieldKey>_asc / <fieldKey>_desc
  limit: 12, // collection cap (default 50)
  multiple: true, // picked mode: pick many instead of one
});
```

Two modes:

- **`mode: "all"`** - the field is bound to the model's record list. Nothing
  to pick in the editor; `sort` and `limit` shape the list. Use it for "render
  all of them" sections (FAQ, logos, testimonials).
- **picked** (the default) - the editor picks one record, or several with
  `multiple: true`. Use it when the page chooses (a featured case study, the
  three plans on a pricing page).

### What the component receives

The stored content value is a record id (or id array) - but the SDK resolves
relations **server-side, before the component renders**. The component never
sees ids:

| Schema                      | `content` type                  |
| --------------------------- | ------------------------------- |
| `mode: "all"` or `multiple` | `CmssyModelRecord[]`            |
| picked single               | `CmssyModelRecord` or `undefined` |

A record's fields live under `record.data` as a `fieldKey → value` map typed
`Record<string, unknown>` - narrow each value before rendering, and use
`record.id` as the React key. A picked single is `undefined` when the
reference dangles (the record was deleted); no `required` flag can rule that
out, so the component must render sensibly without it.

Resolution is one batched pass per page: picked ids go through
`public.model.recordsByIds`, `mode: "all"` fields through
`public.model.records` (deduped per model + sort + limit), both with the
page's locale, before any [server loader](./server-loaders.md) runs. **A
relation never breaks a render**: a fetch failure or dangling id degrades to
an empty list or an absent value and logs `[cmssy] relation resolution
failed` on the server. The editor canvas renders without the server resolve,
so there the value is also the degraded shape - another reason the component
must not assume data is present.

## End to end: testimonials

One model, one block, no loader. The live reference implementation ships in
the [starter](https://github.com/cmssy-io/cmssy-next-starter) under
`blocks/testimonials/`.

**1. The model (CMS-first).** In the admin - or over MCP with `create_model` -
create `testimonial` with fields `quote` (textarea), `author` (text), `role`
(text), `order` (number). Add records. This is data entry, not a deploy.

**2. The block (code-first).**

```ts
// blocks/testimonials/block.ts
import { defineBlock } from "@cmssy/react";
import Testimonials, { testimonialsProps } from "./Testimonials";

export const testimonialsBlock = defineBlock({
  type: "testimonials",
  label: "Testimonials",
  component: Testimonials,
  props: testimonialsProps,
});
```

```tsx
// blocks/testimonials/Testimonials.tsx
import { fields, type BlockProps } from "@cmssy/react";

export const testimonialsProps = {
  heading: fields.text({ label: "Heading", required: true }),
  testimonials: fields.relation({
    label: "Testimonials",
    model: "testimonial",
    mode: "all",
    sort: "order_asc",
  }),
};

export default function Testimonials({
  content,
}: BlockProps<typeof testimonialsProps>) {
  const items = content.testimonials ?? [];
  if (items.length === 0) return null;
  return (
    <section>
      <h2>{content.heading}</h2>
      <ul>
        {items.map((item) => {
          const quote =
            typeof item.data.quote === "string" ? item.data.quote : "";
          const author =
            typeof item.data.author === "string" ? item.data.author : "";
          if (!quote) return null;
          return (
            <li key={item.id}>
              <blockquote>{quote}</blockquote>
              {author ? <cite>{author}</cite> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

The split in one glance: `heading` is view copy and belongs to the block;
the testimonials are content with identity and belong to the model. Renaming
a model field breaks nothing at compile time (the `data` map is untyped) -
which is exactly why the component narrows every value instead of casting.

**3. Register it** in `cmssy/blocks.ts` - or scaffold steps 2-3 with
`cmssy add block testimonials` and swap the generated fields for the relation.

## The development flow

Developing a block against real content never requires cloning pages
(`test-home` copies are the smell that this flow replaces):

1. **Code on localhost.** Run your app locally; the block and its schema hot
   reload.
2. **Dev draft in the editor.** Toggle dev mode in the cmssy editor and point
   it at your local host (`cmssy link` prints the editor deep link). Your
   edits land on a per-user dev draft - the shared draft and the published
   page stay untouched. AI can work the same surface over MCP
   (`target: "devDraft"` on the page write tools).
3. **Promote, then publish.** When the block looks right, promote the dev
   draft to the shared draft and publish. Content validation runs against the
   block manifest on promote, so a schema/content mismatch surfaces as
   warnings instead of a broken page.
