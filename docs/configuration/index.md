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
prerelease: beta # optional, default for all packages
bump-minor-pre-major: true # optional, default for all packages

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

| Key                    | Level           | Default                        | Description                                           |
| ---------------------- | --------------- | ------------------------------ | ----------------------------------------------------- |
| `branch`               | global          | CI default branch, then `main` | Branch to release from                                |
| `cliff-config`         | global          | git-cliff discovery            | Path to a git-cliff config                            |
| `prerelease`           | global, package | none                           | [Pre-release](/guide/pre-releases) identifier         |
| `bump-minor-pre-major` | global, package | `true`                         | Breaking changes only bump minor before `1.0.0`       |
| `component`            | package         | none                           | Tag prefix, see [Monorepos](/configuration/monorepos) |
| `changelog-path`       | package         | `CHANGELOG.md`                 | Changelog file, relative to the package               |
| `initial-version`      | package         | computed from `0.0.0`          | First stable version if no tag exists                 |
| `updaters`             | package         | none                           | [Files to update](/configuration/updaters)            |

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
