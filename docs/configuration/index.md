---
title: relwolf.yaml configuration
description: Complete reference of the relwolf.yaml configuration file - packages, updaters, pre-releases, initial version and more.
---

# relwolf.yaml

`relwolf.yaml` in the repository root is optional. Without it, relwolf releases a single root package without file
updaters. Everything is configured through this file; there are no CLI flags. Secrets and CI context come from
[environment variables](/reference/environment-variables).

```yaml [relwolf.yaml]
branch: main # branch to release from; defaults to the CI default branch, then "main"
cliff-config: cliff.toml # git-cliff config; defaults to git-cliff's own discovery/default
pull-request-title: 'chore(release): Create release ${tags}' # optional, title of the release MR/PR
prerelease: beta # optional, default for all packages
bump-minor-pre-major: true # optional, default for all packages
patch-types: [fix] # commit types that trigger a patch release
minor-types: [feat] # commit types that trigger a minor release
exclude-paths: ['docs/**'] # changes in these globs never count
bootstrap-sha: 1a2b3c4 # ignore history up to this commit if there is no tag yet
tag-template: '${component}-v${version}'
release-name: '${tag}'
branch-prefix: relwolf/
labels: {pending: 'relwolf: pending', tagged: 'relwolf: tagged'}
draft: false
no-changes-text: 'No changes, version bumped to stay in sync.' # '' to add nothing
assignees: [alice]
reviewers: [bob]
release-commit-message: 'chore(release): Create release ${tags}'
pull-request-body: '...'
separate-pull-requests: false
linked-versions: false # true, or [[services/api, services/web]]
linked-tags: per-package # or single: one tag and release per linked group

packages:
  '.':
    component: app # optional for one package; required for every other package (used as tag prefix)
    changelog-path: CHANGELOG.md # relative to the package path
    initial-version: 1.0.0 # optional, first stable version if no tag exists
    prerelease: rc # optional, overrides the global value
    bump-minor-pre-major: false # optional, overrides the global value
    updaters:
      - type: package-json # default path: package.json
      - type: pom-xml # default path: pom.xml
      - type: gradle # default path: build.gradle (also: build.gradle.kts, gradle.properties)
      - type: generic
        path: deploy/values.yaml
```

Paths of updaters and the changelog are relative to the package path. Unknown keys are rejected.

## Options

| Key                      | Level           | Default                                       | Description                                                             |
| ------------------------ | --------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `branch`                 | global          | CI default branch, then `main`                | Branch to release from                                                  |
| `cliff-config`           | global          | git-cliff discovery                           | Path to a git-cliff config                                              |
| `pull-request-title`     | global          | `chore(release): Create release ${tags}`      | Title template, see below                                               |
| `patch-types`            | global          | `[fix]`                                       | Commit types that trigger a patch release                               |
| `minor-types`            | global          | `[feat]`                                      | Commit types that trigger a minor release                               |
| `exclude-paths`          | global          | none                                          | Globs (from the repo root) whose changes never count                    |
| `bootstrap-sha`          | global          | none                                          | Start of the history for packages without a tag                         |
| `tag-template`           | global          | `${component}-v${version}`                    | Tag format, see below                                                   |
| `release-name`           | global          | `${tag}`                                      | Title of the created releases                                           |
| `branch-prefix`          | global          | `relwolf/`                                    | Prefix of the release branch                                            |
| `labels`                 | global          | `relwolf: pending` / `relwolf: tagged`        | Labels `pending` and `tagged`                                           |
| `draft`                  | global          | `false`                                       | Open the release request as draft                                       |
| `no-changes-text`        | global          | `No changes, version bumped to stay in sync.` | Text for packages without changes (linked versions)                     |
| `assignees`              | global          | none                                          | Usernames, set when the request is created                              |
| `reviewers`              | global          | none                                          | Usernames, set when the request is created                              |
| `release-commit-message` | global          | the title                                     | Commit message of the release commit                                    |
| `pull-request-body`      | global          | built in                                      | Body template, see below                                                |
| `separate-pull-requests` | global          | `false`                                       | One request per package, see [Monorepos](/configuration/monorepos)      |
| `linked-versions`        | global          | `false`                                       | Packages sharing one version, see [Monorepos](/configuration/monorepos) |
| `prerelease`             | global, package | none                                          | [Pre-release](/guide/pre-releases) identifier                           |
| `bump-minor-pre-major`   | global, package | `true`                                        | Breaking changes only bump minor before `1.0.0`                         |
| `component`              | package         | none                                          | Tag prefix, see [Monorepos](/configuration/monorepos)                   |
| `changelog-path`         | package         | `CHANGELOG.md`                                | Changelog file, relative to the package                                 |
| `initial-version`        | package         | computed from `0.0.0`                         | First stable version if no tag exists                                   |
| `updaters`               | package         | none                                          | [Files to update](/configuration/updaters)                              |

## Release request title

`pull-request-title` sets the title of the release merge (pull) request. The title is also used as the message of the
release commit.

| Placeholder  | Replaced with                                                                               |
| ------------ | ------------------------------------------------------------------------------------------- |
| `${tags}`    | All tags of the release, comma separated, e.g. `v1.2.3` or `v1.2.3, api-v0.4.0`             |
| `${version}` | The bare version (`1.2.3`) if a single package is released, otherwise the same as `${tags}` |

```yaml [relwolf.yaml]
pull-request-title: 'chore: release ${version}'
```

Unknown placeholders fail the run. Keep a type that does not bump the version (`chore`, `docs`, …); a `feat` or `fix`
title would count as a releasable commit once the release is squash-merged.

## Commit types

`patch-types` and `minor-types` are complete lists (they replace the defaults, so list `fix` again if you want to keep
it). A type may only be in one list. Breaking changes (`!` or `BREAKING CHANGE`) always release a major version.
`exclude-paths` are globs such as `docs/**`; commits that only touch them are ignored for the version and the changelog.
`bootstrap-sha` is only used while a package has no tag: the history up to and including that commit is ignored.

## Tags and release names

`tag-template` contains `${version}` exactly once and may contain `${component}` (once). Without a component, the
placeholder and the separator behind it are dropped, so the default yields `v1.2.3` or `api-v1.2.3`. With several
packages the template must contain `${component}`. Only letters, digits and `._/@-` are allowed as literal characters.

`release-name` supports `${tag}`, `${version}` (without prefix) and `${component}`.

## Release request

`branch-prefix`, `labels`, `draft`, `assignees` and `reviewers` configure the request. `draft` and the people are only
applied when the request is created; relwolf keeps a draft state and never touches assignees afterwards.
Usernames are resolved by the provider; unknown users fail the run.

`no-changes-text` is written below the changelog entry and into the release notes of a package that was only released
to follow the version of linked packages. Set it to an empty string to leave such entries as git-cliff renders them.

`release-commit-message` accepts the same placeholders as the title and may span several lines.

`pull-request-body` is a complete template with the placeholders `${tags}`, `${version}`, `${releases}` (bullet list),
`${hint}` (note about `RELWOLF_RELEASE_AS`, otherwise empty) and `${notes}` (the release notes, required exactly once).
The markers relwolf needs to track the release are always appended.

## Typical setups

::: code-group

```yaml [Node.js]
packages:
  '.':
    updaters:
      - type: package-json
```

```yaml [Maven]
packages:
  '.':
    updaters:
      - type: pom-xml
```

```yaml [Gradle]
packages:
  '.':
    updaters:
      - type: gradle
```

```yaml [Helm / generic]
packages:
  '.':
    updaters:
      - type: generic
        path: deploy/values.yaml
```

:::
