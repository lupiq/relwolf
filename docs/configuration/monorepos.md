---
title: Monorepo releases
description: Release multiple packages independently from one repository with relwolf, each with its own version, tags, changelog and release merge request.
---

# Monorepos

```yaml [relwolf.yaml]
packages:
  '.':
    updaters: [{type: package-json}]
  services/api:
    component: api # tags: api-v1.2.3
    updaters:
      - type: pom-xml
```

- By default packages are versioned independently and listed together in **one** release merge request.
  [Linked versions](#linked-versions) and [separate requests](#separate-release-requests) change that.
- A package at `.` ignores changes inside other configured packages.
- Only one package may omit `component`; every other package needs one. The component is the tag prefix
  (`api-v1.2.3`).
- Only commits touching a package's path count for that package.
- Updater and changelog paths are relative to the package path.

## Choosing a setup

| Goal                                    | Options                                        |
| --------------------------------------- | ---------------------------------------------- |
| Independent versions, one request       | default                                        |
| Independent versions, one request each  | `separate-pull-requests: true`                 |
| One shared version, one tag per package | `linked-versions: true`                        |
| One shared version, one tag and release | `linked-versions: true`, `linked-tags: single` |

## Forcing versions per package

With [`RELWOLF_RELEASE_AS`](/guide/release-as) use `component=version`, for example `api=2.0.0`. If every package has a
component, a bare version is an error.

## Linked versions

`linked-versions: true` makes all packages share one version: the highest version any package needs. Packages without
changes are released as well. Alternatively list groups of package paths:

```yaml [relwolf.yaml]
linked-versions:
  - [services/api, services/web]
```

A package can be in one group only, and a group needs at least two packages.

By default every linked package still gets its own tag and release. With `linked-tags: single` a group gets **one** tag
and **one** release, named by the group's first package (the root package `.` if it is a member); its `tag-template`
applies. The release notes contain one section per package, and every package keeps its own changelog file. Packages
of the group then no longer need a `component` for tags. `linked-tags: single` requires `linked-versions`.

## Separate release requests

With `separate-pull-requests: true` every package (or linked group) gets its own release request on the branch
`<branch-prefix><branch>/<component>`. The package without a component uses `root`, so that name is reserved.

## Example: multi-module Gradle project with axion-release

Several micro-services and shared modules, each with its own changelog, but one common version. This fits
[axion-release-plugin](https://github.com/allegro/axion-release-plugin), which by default derives the project version
from the nearest tag `v<version>` and applies it to all modules (`allprojects { version = rootProject.scmVersion.version }`).

```yaml [relwolf.yaml]
linked-versions: true # all modules share one version
packages:
  '.': # tags: v1.2.3 - the tag axion-release reads
    updaters: []
  services/orders:
    component: orders # tags: orders-v1.2.3
    updaters: []
  common/core:
    component: core # tags: core-v1.2.3
    updaters: []
```

- **No Gradle updater.** The version lives in the tags, not in `build.gradle`, so relwolf only writes changelogs.
- Every module gets `CHANGELOG.md` in its own directory (`services/orders/CHANGELOG.md`). Only commits touching the module
  appear there; a module without changes gets the
  [`no-changes-text`](/configuration/#release-request) placeholder.
- The root package (without `component`) produces the plain tag `v1.2.3` and a root `CHANGELOG.md` for changes outside
  the modules. axion-release ignores the component tags because they do not start with `v`.
- To avoid one tag per module, add `linked-tags: single`: relwolf then creates only `v1.2.3` (one release with a
  section per module), while each module still gets its own `CHANGELOG.md`.
- relwolf tags the merge commit of the release request, so `./gradlew currentVersion` reports `1.2.3` there and
  `1.2.4-SNAPSHOT` afterwards. Do not run axion's `release` task; relwolf decides the version.
- Axion also supports a separate version per module (one tag prefix per module). To mirror that, drop `linked-versions` and
  configure `scmVersion { tag { prefix = name } }` per module with `tag-template: '${component}-${version}'` (axion expects `module-1.2.3`).
