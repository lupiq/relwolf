---
title: relwolf recipes
description: Copy-and-paste relwolf.yaml examples for Node.js, Maven, Gradle, Python, Rust, .NET, Helm, Go and floating tags such as @v1.
---

# Recipes

Starting points for common project types. Each `relwolf.yaml` goes into the repository root and tells relwolf which
files carry the version. All options are described in the [relwolf.yaml reference](/configuration/relwolf-yaml) and the
[updaters](/configuration/updaters).

## Node.js (npm)

Updates `version` in `package.json` and, if present, the lockfiles `package-lock.json` and `npm-shrinkwrap.json`.

```yaml [relwolf.yaml]
# yaml-language-server: $schema=https://relwolf.lupiq.io/schema.json
packages:
  '.':
    updaters:
      - type: package-json
```

## Java (Maven)

Updates the project's own `<version>` in `pom.xml`, not the parent's or any dependency's.

```yaml [relwolf.yaml]
packages:
  '.':
    updaters:
      - type: pom-xml
```

## Java or Kotlin (Gradle)

Updates `version` in `build.gradle`. Point `path` at another file for the Kotlin DSL or a `gradle.properties` file.

```yaml [relwolf.yaml]
packages:
  '.':
    updaters:
      - type: gradle
        path: gradle.properties
```

For a multi-module project with one common version, see the
[Gradle example](/configuration/monorepos#example-multi-module-gradle-project-with-axion-release).

## Python

Updates `[project] version` (PEP 621) or `[tool.poetry] version` in `pyproject.toml`. Dynamic versions are not
supported. If the version is also in a module, add a [marker](/configuration/updaters#generic-updater) to that line and
list the file as `generic`:

```yaml [relwolf.yaml]
packages:
  '.':
    updaters:
      - type: pyproject
      - type: generic
        path: src/mypackage/__init__.py
```

```python [src/mypackage/__init__.py]
__version__ = "1.2.3"  # x-relwolf-version
```

## Rust

Updates `[package] version` or `[workspace.package] version` in `Cargo.toml` and the crate's own entry in `Cargo.lock`.

```yaml [relwolf.yaml]
packages:
  '.':
    updaters:
      - type: cargo
```

## .NET

The `dotnet` updater needs a `path`: the first `<Version>` of a `.csproj` or `Directory.Build.props`.

```yaml [relwolf.yaml]
packages:
  '.':
    updaters:
      - type: dotnet
        path: Directory.Build.props
```

## Helm chart

Updates `version` and, if present, `appVersion` in `Chart.yaml`.

```yaml [relwolf.yaml]
packages:
  '.':
    updaters:
      - type: helm
```

## Floating tags such as `@v1`

Keep references like `uses: org/repo@v1` or `image: org/repo:1.2` current by adding a partial marker to the line, and
list the file as `generic`. Pre-releases leave partial markers unchanged.

```yaml [relwolf.yaml]
packages:
  '.':
    updaters:
      - type: generic
        path: README.md
```

```markdown [README.md]
- uses: org/repo@v1 <!-- x-relwolf-major -->
```

## Go, Swift and Terraform modules

The version lives only in the git tag, so there is nothing to update. Without a `relwolf.yaml`, relwolf releases the
root package, tags it and writes the changelog. Add a [relwolf.yaml](/configuration/relwolf-yaml) only to change
defaults such as the [tag format](/configuration/relwolf-yaml#tags-and-release-names).

## More

- Several packages in one repository: [Monorepos](/configuration/monorepos)
- PHP, Dart, Flutter and any JSON, YAML or TOML file: the `json`, `yaml` and `toml` updaters in
  [Key paths](/configuration/updaters#key-paths)
- Ruby, `setup.py`, Elixir and any other text file: the [generic updater](/configuration/updaters#generic-updater)
