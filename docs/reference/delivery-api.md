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

## Wrapped by the SDK

You normally never write these - the listed helper calls them for you.

| Operation                 | Helper                                   | Returns                                                      |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `publicPage`              | `fetchPage`                              | `{ id, blocks, publishedBlocks }`                            |
| `publicPageById`          | `fetchPageById`                          | `{ id, publishedBlocks }`                                    |
| `publicPages`             | `fetchPages`                             | `[{ id, slug, updatedAt, publishedAt }]`                     |
| `publicPage` (SEO fields) | `fetchPageMeta`                          | `{ id, seoTitle, seoDescription, seoKeywords, displayName }` |
| `publicPageLayouts`       | `fetchLayouts`                           | `[{ position, blocks }]`                                     |
| `publicSiteConfig`        | `fetchSiteConfig` / `resolveSiteLocales` | site name, locales, features, branding                       |
| `publicForm`              | `resolveForms` (and `context.forms`)     | form fields + settings                                       |
| `submitForm`              | `SUBMIT_FORM_MUTATION`                   | `{ success, message, submissionId, ... }`                    |

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
  $offset: Int
  $populate: [String!]
) {
  publicModelRecords(
    workspaceId: $workspaceId
    modelSlug: $modelSlug
    filter: $filter
    sort: $sort
    limit: $limit
    offset: $offset
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
  }
}
```

`MODEL_RECORDS_QUERY` and `MODEL_DEFINITIONS_QUERY` are exported from
`@cmssy/react` if you prefer the SDK's strings over your own.

### List child pages (blog index, docs tree)

```graphql
query PublicPagesByType(
  $workspaceId: String!
  $parentSlug: String
  $search: String
  $limit: Int
  $offset: Int
) {
  publicPagesByType(
    workspaceId: $workspaceId
    parentSlug: $parentSlug
    search: $search
    limit: $limit
    offset: $offset
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
```

This powers a blog or docs index - see the [listing recipe](../building-blocks/recipes.md).

### Submit a form

```graphql
mutation SubmitForm($formId: ID!, $input: SubmitFormInput!) {
  submitForm(formId: $formId, input: $input) {
    success
    message
    submissionId
    redirectUrl
  }
}
```

Exported as `SUBMIT_FORM_MUTATION`; pass `{ formId, input: { data } }`.

## Member auth operations

The `siteMember*` mutations (`siteMemberLogin`, `siteMemberRegister`,
`siteMemberRefresh`, `siteMemberLogout`, `siteMemberForgotPassword`,
`siteMemberResetPassword`, `siteMemberVerifyEmail`) back the auth flow. **Do not
call them directly** - mount [`createCmssyAuthRoute`](../auth/member-auth.md),
which handles them server-side and seals the session cookie.

## Notes

- `data` and `filter` use the `JSON` scalar - pass plain objects.
- `customFields` on pages is a `JSON` map of the page type's custom fields.
- Reads return only **published** content unless a valid `previewSecret` is
  supplied (the SDK does this in edit mode via your `draftSecret`).
