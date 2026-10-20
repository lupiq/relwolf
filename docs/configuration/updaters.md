---
title: Version file updaters
description: Update the version in package.json, pom.xml, Gradle files or any text file with relwolf updaters and the x-relwolf-version marker.
---

# Updaters

Updaters change the version in your project files in the release commit.

| Type           | What it changes                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `package-json` | the top-level `"version"`                                                                       |
| `pom-xml`      | the project's own `<version>` (not the parent's or any dependency's)                            |
| `gradle`       | a top-level `version = '…'` / `version "…"` (Groovy/Kotlin DSL) or `version=…` in `.properties` |
| `generic`      | the first version on every line containing a marker (see below)                                 |

Each updater takes an optional `path`, relative to the package. The path may be a glob (e.g. `charts/*/Chart.yaml`); every tracked file that matches is updated, and a glob without match fails the run. Defaults: `package.json`, `pom.xml`, `build.gradle`.

## Generic updater

```yaml
image:
  tag: 1.2.3 # x-relwolf-version
```

The marker has to be the **last thing on the line** (usually in a comment, optionally before a closing `-->` or `*/`).
Its name selects the granularity of the first matching version on that line. A leading `v` is kept.

## Partial markers

| Marker              | Replaces                            | Example           |
| ------------------- | ----------------------------------- | ----------------- |
| `x-relwolf-version` | the full version                    | `1.2.3` → `2.0.0` |
| `x-relwolf-minor`   | `MAJOR.MINOR`, not for pre-releases | `1.2` → `2.0`     |
| `x-relwolf-major`   | `MAJOR`, not for pre-releases       | `1` → `2`         |

Use the partial markers for references to floating tags:

::: code-group

```yaml [GitHub Action]
- uses: org/repo@v1 # x-relwolf-major
```

```yaml [Docker image]
image: org/repo:1.2 # x-relwolf-minor
```

```markdown [Markdown]
Download version 1.2.3 <!-- x-relwolf-version -->
```

:::

Pre-releases leave partial markers unchanged, because no floating tag exists for them.
