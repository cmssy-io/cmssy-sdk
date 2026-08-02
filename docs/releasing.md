# Releasing the SDK

`.github/workflows/release.yml` publishes every `@cmssy/*` package to npm. Push a
version tag, or run it from the Actions tab:

```bash
git tag v11.7.0
git push origin v11.7.0
```

On a tag release the tag must match the versions in `package.json` - those are the
source of truth, and the job fails rather than publishing something the tag does
not name. A manual dispatch publishes the current branch's versions as they are.

## Trusted publishing, no token

Authentication is the GitHub OIDC token, exchanged for publish rights. There is no
`NPM_TOKEN`. The consequence: **each published package must have this repository
and this workflow registered as a Trusted Publisher** (npmjs.com → package →
Settings → Trusted Publisher). A new package fails its first publish until that
registration exists.

Two constraints follow from the toolchain:

- Trusted publishing needs **npm >= 11.5.1**, and the node 22 runner image ships
  10.x, so the job upgrades npm first.
- **pnpm packs, npm publishes.** `pnpm pack` rewrites `workspace:*` dependencies
  into the tarball; npm then publishes that tarball, because this repo is pinned
  to pnpm 9, which predates pnpm's own OIDC support. It also keeps the OIDC path
  identical to the single-package cmssy repos.

## Order, and what the job refuses to do

Packages publish in dependency order - `core`, then the renderers, then the
adapters - and a package whose current version is already on npm is skipped, so a
re-run after a partial failure is safe.

Releases are serialized by a concurrency group: two runs cannot race past the
"already on npm" check.

The build runs before the publish because `@cmssy/next` typechecks against
`@cmssy/react`'s built `.d.ts`, which does not exist on a fresh checkout.

## Verifying as a stranger

`npm view` runs with the workflow's credentials, so it will happily find a package
nobody else can install - which is how 5.0.0 shipped three packages that 404'd for
everyone. The job re-reads the registry anonymously after publishing, with
retries: a successful publish is eventually consistent and the anonymous replica
can lag several minutes, so a propagation delay must not be mistaken for a
restricted package.

## Schema drift is not a release gate

`.github/workflows/schema-drift.yml` compares the vendored `schema.graphql`
against production **daily**, and on demand - never on a pull request. Production
is not this repo's to change, so gating a PR on it fails an author for a diff they
did not write; that happened twice in one afternoon when the public media surface
was removed upstream. A red nobody can act on is a red everyone learns to skip.

Refresh the vendored copy with:

```bash
pnpm fetch-prod-schema
cp prod-schema.graphql schema.graphql
```
