---
title: Changesets
description: Use Changesets instead of Conventional Commits with relwolf - changesets decides versions and changelogs, relwolf opens the release merge request, tags and releases.
---

# Changesets

By default relwolf derives versions and changelogs from [Conventional Commits](/guide/version-rules). Repositories
that use [Changesets](https://changesets.dev) can switch to it instead: changesets decides the versions and writes the
changelogs; relwolf keeps doing the rest, i.e. the release merge request, tags and releases on GitLab and GitHub.

```yaml [relwolf.yaml]
strategy: changesets
```

## Prerequisites

- A JavaScript workspace that changesets understands (a single `package.json`, or pnpm, npm, yarn, bun, lerna or
  bolt workspaces) at the repository root.
- `.changeset/config.json`, as created by `npx @changesets/cli init`.
- A full clone, as for every relwolf job.

relwolf brings everything it needs to version the packages. You do not need to install `@changesets/cli` or the
workspace dependencies in the job.

## How it works

On every run, relwolf does the same as `changeset version` on a clean checkout:

1. It reads the pending changesets in `.changeset/` and lets changesets plan the release. This includes the
   `fixed`, `linked`, `ignore` and `updateInternalDependencies` settings and dependents that need a bump.
2. Changesets writes the new versions into the `package.json` files (including the dependency ranges), adds an entry to
   every `CHANGELOG.md` and removes the consumed changesets. relwolf then runs the top-level
   [`updaters`](#version-markers) and the [`pre-commit-script`](/configuration/relwolf-yaml#pre-commit-script).
3. Everything that changed becomes the release commit of the release merge request. relwolf resets the working tree
   afterwards. Unlike with Conventional Commits, the commit may delete files (the consumed changesets).
4. Once the merge request is merged, relwolf tags the merge commit and creates one release per package. The release
   notes are the changelog entry that changesets wrote.

The current version comes from `package.json`, not from tags. Tags are only an output.

If there are no pending changesets, relwolf logs it and closes a release merge request that is still open.

## Tags

relwolf names the tags the way `changeset tag` and `changeset publish` do:

| Workspace            | Tag                |
| -------------------- | ------------------ |
| Single package       | `v1.2.3`           |
| Workspace (any size) | `@scope/pkg@1.2.3` |

The release title follows [`release-name`](/configuration/relwolf-yaml#tags-and-release-names); `${component}` is the
package name.

## Private packages

Private packages follow `privatePackages` in `.changeset/config.json`. By default (`{"version": false, "tag": false}`)
changesets does not version them at all. With `"version": true` they get new versions and changelog entries, and only
`"tag": true` gives them tags and releases as well.

A release merge request needs at least one package with a tag. If the pending changesets would only release private
packages without tags, relwolf opens no merge request and the changesets stay pending until a package with a tag is
released, too.

## Pre-releases

Use the pre-release mode of changesets instead of the `prerelease` option:

```sh
npx @changesets/cli pre enter beta   # commit .changeset/pre.json
npx @changesets/cli pre exit         # commit the change for the stable release
```

In pre mode, the release merge request contains versions like `1.1.0-beta.0`, and the releases are marked as
pre-releases. Changesets keeps the consumed changesets in `.changeset/pre/` until the pre mode ends.

## Changelog generators

The `changelog` setting of `.changeset/config.json` selects the generator. relwolf ships these:

| Generator                             | Notes                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@changesets/cli/changelog` (default) | Same output as `@changesets/changelog-git`                                                          |
| `@changesets/changelog-git`           | Commit hash and summary                                                                             |
| `@changesets/changelog-github`        | Links to pull requests and authors. GitHub only; uses `GITHUB_TOKEN`, falls back to `RELWOLF_TOKEN` |

relwolf looks up other generators in the `node_modules` of the repository, so install them in the job before relwolf
runs.

Changesets does not format the files in relwolf; its `format` setting is ignored. Format them in the
`pre-commit-script` if needed.

## Options

`relwolf.yaml` keeps the options for the release merge request and releases: `branch`, `branch-prefix`, `labels`,
`draft`, `assignees`, `reviewers`, `pull-request-title`, `pull-request-body`, `release-commit-message`,
`release-name`, `release-emoji` (release title only), `http-timeout`, `pre-commit-script`, `pre-commit-script-tokens`
and the top-level `updaters`.

Changesets decides everything else. These options are rejected with `strategy: changesets`:

`packages`, `tag-template`, `prerelease`, `bump-minor-pre-major`, `patch-types`, `minor-types`, `exclude-paths`,
`bootstrap-sha`, `linked-versions`, `linked-tags`, `separate-pull-requests`, `cliff-config`, `rewrite-changelog`,
`changelog-links`, `changelog-links-text`, `no-changes-text`.

[`RELWOLF_RELEASE_AS`](/guide/release-as) is not supported either; add a changeset with the bump you want instead.

## Version markers

Changesets updates the `package.json` files. For other files with versions (a README, a Helm chart, …) use
[component markers](/configuration/updaters#component-markers-monorepos) with the package name and list the files in
the top-level `updaters`:

```yaml [relwolf.yaml]
strategy: changesets
updaters:
  - type: generic
    path: README.md
```

```md [README.md]
npm install @acme/ui@1.2.3 <!-- x-relwolf-version:@acme/ui -->
```

## Lockfiles

Changesets does not touch lockfiles. If a workspace package depends on another one with a version range (not
`workspace:`), refresh the lockfile in the `pre-commit-script`, for example with `pnpm install --lockfile-only`.

## Migrating from changesets/action

- Replace the `changesets/action` job with the relwolf job of the [GitHub](/guide/github) or [GitLab](/guide/gitlab)
  guide and add `strategy: changesets` to `relwolf.yaml`.
- Keep `.changeset/` as it is. Pending changesets end up in the first release merge request of relwolf.
- relwolf does not publish to npm. Publish in a job on the tags it creates, for example with
  `npx @changesets/cli publish` or `pnpm publish -r`.
