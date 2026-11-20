---
title: Delivery API
description: The public GraphQL delivery API - which queries exist, how workspace scoping works (workspaceSlug vs workspaceId), and which the SDK wraps vs which you write yourself.
---

# Delivery API

cmssy serves published content over a single GraphQL endpoint. The SDK already
wraps the common reads (pages, layouts, site config, forms); for anything else -
custom models, records, listing child pages - you send your own query through the
[delivery client](./sdk-api.md).

## Endpoint & scoping

Public content reads are delivered over the **org-scoped path**
`{apiBase}/public/{orgSlug}/{workspaceSlug}/graphql`, where `apiBase` is your
`apiUrl` with its trailing `/graphql` stripped (default `https://api.cmssy.io`,
so requests go to `https://api.cmssy.io/public/{org}/{ws}/graphql`; override
`apiUrl` only for self-host). `org` and `workspaceSlug` come from your config.
Because the org is in the path, a workspace slug only needs to be unique **within
its organization**.

> **Breaking change (SDK 0.15.0).** Delivery moved from a single `/graphql`
> endpoint (with `workspaceSlug` as a global lookup) to the org-scoped path above.
> Add a required **`org`** (org slug) to your config / set `CMSSY_ORG_SLUG`. No
> other code changes are needed - the fetch helpers build the path for you.

Every operation is **workspace-scoped**, in one of two ways:

- **`workspaceSlug` (String!)** - the page/layout/config/form reads. The SDK
  fetch helpers pass it from your config automatically.
- **`workspaceId` (String!)** - the model/record/page-by-type reads. Use
  `client.queryScoped(...)`: when your query declares `$workspaceId` and you do
  not pass it, the SDK resolves it from `workspaceSlug` and injects both the
  variable and the `x-workspace-id` header.

```ts
// $workspaceId is filled in for you
await client.queryScoped(MY_QUERY, { modelSlug: "products", limit: 20 });
```

A storefront that sells through a sales channel sets `channel` in the config,
and the SDK fills `$channel` the same way on any operation that declares it -
the cart, checkout and the price reads. See
[Sales channels](../auth/member-auth.md#sales-channels).

## Wrapped by the SDK

You normally never write these - the listed helper calls them for you.

Every delivery field is namespaced under `public` - there are no flat root
fields.

| Operation                      | Helper                                   | Returns                                                      |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------ |
| `public.page.get`              | `fetchPage`                              | `{ id, blocks, publishedBlocks }`                            |
| `public.page.getById`          | `fetchPageById`                          | `{ id, publishedBlocks }`                                    |
| `public.page.list`             | `fetchPages`                             | `[{ id, slug, updatedAt, publishedAt }]`                     |
| `public.page.get` (SEO fields) | `fetchPageMeta`                          | `{ id, seoTitle, seoDescription, seoKeywords, displayName }` |
| `public.page.layouts`          | `fetchLayouts`                           | `[{ region, blocks }]`                                     |
| `public.siteConfig`            | `fetchSiteConfig` / `resolveSiteLocales` | site name, locales, features, branding                       |
| `public.form.get`              | `resolveForms` (and `context.forms`)     | form fields + settings                                       |
| `public.form.submit`           | `SUBMIT_FORM_MUTATION`                   | `{ success, message, submissionId, ... }`                    |

## Write these yourself

These have no SDK helper - send them via `client.queryScoped(...)`.

### Custom model records

```graphql
query PublicModelRecords(
  $workspaceId: String!
  $modelSlug: String!
  $filter: JSON
  $sort: String
  $limit: Int
  $after: String
  $populate: [String!]
) {
  public {
    model {
      records(
        workspaceId: $workspaceId
        modelSlug: $modelSlug
        filter: $filter
        sort: $sort
        limit: $limit
        after: $after
        populate: $populate
      ) {
        items {
          id
          modelId
          data
          status
          createdAt
          updatedAt
        }
        total
        hasMore
        nextCursor
      }
    }
  }
}
```

Page with `after`: pass the previous page's `nextCursor` and keep the same
`filter` and `sort`; `nextCursor` is `null` on the last page. `offset` still
works for jumping to a page number, but the API refuses an offset above 10,000
and cannot combine a non-zero offset with `after`, so walk a large model by
cursor. The cursor also keeps a page stable while records are added or
removed, which an offset does not.

`$sort` is `<fieldKey>_asc` or `<fieldKey>_desc` (`CmssyRecordSort`); any other
value, or an unknown field key, is rejected with `BAD_USER_INPUT`. Omit it for
the model's default sort, else newest first.

`MODEL_RECORDS_QUERY` and `MODEL_DEFINITIONS_QUERY` are exported from
`@cmssy/core/internal` if you prefer the SDK's strings over your own. That entry
point is unstable by name: it is where the adapters read from, and nothing
promises the shape across a minor.

### List child pages (blog index, docs tree)

```graphql
query PublicPagesByType(
  $workspaceId: String!
  $parentSlug: String
  $search: String
  $limit: Int
  $offset: Int
  $locale: String
) {
  public {
    page {
      byType(
        workspaceId: $workspaceId
        parentSlug: $parentSlug
        search: $search
        limit: $limit
        offset: $offset
        locale: $locale
      ) {
        items {
          id
          slug
          fullSlug
          publishedAt
          displayName
          seoTitle
          seoDescription
          customFields
          pageType
        }
        total
        hasMore
      }
    }
  }
}
```

`byType` also takes `pageType`, `sortBy`, `includeDrafts`, `previewSecret` and
`customFieldFilters`; `limit` defaults to 9, not to unbounded.

`locale` picks the language of media alt text in `customFields`. A page's custom
fields are not stored per language, so without it a media value (a post's cover
image, say) carries the alt of the workspace default language only. Pass the
language the page renders in - `context.locale.current` in a block loader - and
each media value carries the asset's alt in that language, falling back to the
default language, then to any language that has one. A language the workspace
has not enabled reads as the default language.

This powers a blog or docs index - see the [listing recipe](../building-blocks/recipes.md).

### Submit a form

```graphql
mutation SubmitForm($formId: ID!, $input: SubmitFormInput!) {
  public {
    form {
      submit(formId: $formId, input: $input) {
        success
        message
        submissionId
        redirectUrl
      }
    }
  }
}
```

Exported as `SUBMIT_FORM_MUTATION`; pass `{ formId, input: { data } }`.

## Member auth operations

The `siteMember { ... }` mutations (`siteMember.login`, `siteMember.register`,
`siteMember.refresh`, `siteMember.logout`, `siteMember.forgotPassword`,
`siteMember.resetPassword`, `siteMember.verifyEmail`) back the auth flow.
`account.profile`, `account.prices` and `siteMember.updateProfile`, `changePassword`,
`requestLoginChange`, `confirmLoginChange` and `deleteAccount` let a signed-in
member manage their own account. Since
10.0 you call them yourself - **server-side only**, sealing the returned tokens
into an httpOnly cookie. Never from the browser: the response carries a refresh
token. See [Member auth](../auth/member-auth.md).

## Notes

- `data` and `filter` use the `JSON` scalar - pass plain objects.
- `customFields` on pages is a `JSON` map of the page type's custom fields.
- Reads return only **published** content unless a valid `previewSecret` is
  supplied (the SDK does this in edit mode via your `draftSecret`).
