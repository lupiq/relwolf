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

- Packages are versioned independently and listed together in **one** release merge request.
- A package at `.` ignores changes inside other configured packages.
- Only one package may omit `component`; every other package needs one. The component is the tag prefix
  (`api-v1.2.3`).
- Only commits touching a package's path count for that package.
- Updater and changelog paths are relative to the package path.

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

## Separate release requests

With `separate-pull-requests: true` every package (or linked group) gets its own release request on the branch
`<branch-prefix><branch>/<component>`. The package without a component uses `root`, so that name is reserved.
