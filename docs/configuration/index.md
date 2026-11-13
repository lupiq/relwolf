---
title: relwolf configuration
description: Configure relwolf with relwolf.yaml - options, monorepos, updaters for version files, the git-cliff changelog and Changesets.
---

# Configuration

relwolf is configured through a single optional file, `relwolf.yaml`, in the repository root. There are no CLI flags;
secrets and CI context come from [environment variables](/reference/environment-variables).

- [relwolf.yaml](/configuration/relwolf-yaml): all options at a glance, the pre-commit script and editor completion
- [Monorepos](/configuration/monorepos): several packages, component tags and linked versions
- [Updaters](/configuration/updaters): update the version in `package.json`, `pom.xml`, Gradle, `pyproject.toml`,
  `Cargo.toml`, Helm charts and any other file
- [Changelog (git-cliff)](/configuration/changelog): format of the changelog and release notes
- [Changesets](/configuration/changesets): let Changesets decide versions and changelogs instead of Conventional
  Commits
