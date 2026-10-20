---
title: Version rules (Conventional Commits to SemVer)
description: How relwolf maps Conventional Commits to SemVer bumps - feat, fix and breaking changes - including 0.x handling and the initial version.
---

# Version rules

| Commit                                   | Bump  |
| ---------------------------------------- | ----- |
| `feat!:`, `fix(x)!:`, `BREAKING CHANGE:` | major |
| `feat:`                                  | minor |
| `fix:`                                   | patch |
| everything else                          | none  |

::: tip Customisable types
The table shows the defaults. Use [`minor-types` and `patch-types`](/configuration/#commit-types) to change which
commit types trigger a minor or patch release, e.g. `patch-types: [fix, build]`. Breaking changes always bump major.
:::

- Before `1.0.0` a breaking change only bumps the minor version (`bump-minor-pre-major`, default `true`).
- Without any tag the first release is calculated from `0.0.0` (`feat` → `0.1.0`, `fix` → `0.0.1`), unless
  `initial-version` is set.
- Tags are `v1.2.3`; packages with a `component` use `<component>-v1.2.3`.
- Only commits touching a package's path count for that package.
- Reverted commits do not count: a `Revert "feat: a"` commit (or git's `This reverts commit <sha>` line) cancels the
  original commit since the last release. If nothing else is releasable, an open release merge request is closed.
  Both commits are also left out of the changelog.

## Examples

| Last tag | Commits since                                 | Next version | Why                         |
| -------- | --------------------------------------------- | ------------ | --------------------------- |
| `v1.2.3` | `fix: a`                                      | `1.2.4`      | patch                       |
| `v1.2.3` | `fix: a`, `feat: b`                           | `1.3.0`      | highest bump wins           |
| `v1.2.3` | `feat!: c`                                    | `2.0.0`      | breaking change             |
| `v0.4.0` | `feat!: c`                                    | `0.5.0`      | `bump-minor-pre-major`      |
| `v0.4.0` | `feat!: c` with `bump-minor-pre-major: false` | `1.0.0`      | breaking change bumps major |
| none     | `feat: a`                                     | `0.1.0`      | computed from `0.0.0`       |
| `v1.2.3` | `docs: a`, `chore: b`                         | none         | nothing releasable          |

Use [`RELWOLF_RELEASE_AS`](/guide/release-as) to override the computed version.
