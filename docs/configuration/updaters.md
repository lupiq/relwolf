---
title: Version file updaters
description: Update the version in package.json, pom.xml, Gradle, pyproject.toml, Cargo.toml, .NET, Helm, JSON/YAML/TOML files or any text file with relwolf updaters and the x-relwolf-version marker.
---

# Updaters

Updaters change the version in your project files in the release commit.

| Type           | Default path       | What it changes                                                                                 |
| -------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `package-json` | `package.json`     | the top-level `"version"` (and the lockfiles, see below)                                        |
| `pom-xml`      | `pom.xml`          | the project's own `<version>` (not the parent's or any dependency's)                            |
| `gradle`       | `build.gradle`     | a top-level `version = '…'` / `version "…"` (Groovy/Kotlin DSL) or `version=…` in `.properties` |
| `pyproject`    | `pyproject.toml`   | `[project] version` (PEP 621) or `[tool.poetry] version`; dynamic versions are not supported    |
| `cargo`        | `Cargo.toml`       | `[package] version` or `[workspace.package] version` (and the own entry in `Cargo.lock`)        |
| `dotnet`       | – (`path` needed)  | the first `<Version>` of a `.csproj` or `Directory.Build.props`                                 |
| `helm`         | `Chart.yaml`       | `version` and, if present, `appVersion`                                                         |
| `json`         | – (`path` + `key`) | the string at a key path of any JSON file                                                       |
| `yaml`         | – (`path` + `key`) | the scalar at a key path of any block-style YAML file                                           |
| `toml`         | – (`path` + `key`) | the string at a key path of any TOML file                                                       |
| `generic`      | – (`path` needed)  | the first version on every line containing a marker (see below)                                 |

Each updater takes an optional `path`, relative to the package. The path may be a glob (e.g. `charts/*/Chart.yaml`); every tracked file that matches is updated, and a glob without match fails the run.

All updaters keep the formatting, comments and indentation of the file; only the version is replaced.

## Lockfiles

Lockfiles that repeat the project's own version are updated together with the manifest, if they exist next to it:

| Updater        | Also updates                                                |
| -------------- | ----------------------------------------------------------- |
| `package-json` | `package-lock.json` and `npm-shrinkwrap.json` (both places) |
| `cargo`        | the entry of the own crate in `Cargo.lock`                  |

A missing lockfile is skipped silently. Other lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `composer.lock`, `Gemfile.lock`) do not contain the version of the project itself, so there is nothing to update. To leave lockfiles alone:

```yaml
updaters:
  - type: package-json
    lockfiles: false
```

## Key paths

The `json`, `yaml` and `toml` updaters replace the string at a dotted `key` path. Array indices are not supported, and keys containing dots cannot be addressed.

```yaml
updaters:
  - type: yaml
    path: pubspec.yaml # Dart / Flutter
    key: version
  - type: json
    path: composer.json # PHP
    key: version
  - type: toml
    path: pyproject.toml
    key: tool.mytool.version
```

## Not needed or covered by `generic`

- **Go, Swift, Terraform modules:** the version lives only in the git tag; nothing to update.
- **Ruby gemspec / `version.rb`, Python `setup.py` / `setup.cfg` / `__init__.py`, Elixir `mix.exs`:** put the marker on the line with the version and list the file as `generic`:

  ```ruby
  VERSION = '1.2.3' # x-relwolf-version
  ```

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
