---
title: Migrating existing changelogs
description: Adopt relwolf in a project with an existing history and changelog - split a root changelog into one per module with git-cliff and add component tags.
---

# Migrating existing changelogs

When you introduce relwolf into an existing project, two things need attention: the changelog files and the tags.

## Generate changelogs once with git-cliff

relwolf uses [git-cliff](https://git-cliff.org) and your `cliff.toml`, so you can generate the initial files with the same
format. Run this once from the repository root, with the tag pattern of your existing tags:

```sh
git cliff --include-path "services/orders/**" \
  --tag-pattern '^v[0-9]+\.[0-9]+\.[0-9]+$' \
  -o services/orders/CHANGELOG.md
```

- `--include-path` limits each file to the commits touching that module.
- Repeat for every module. To rebuild the root changelog without the modules, use `--exclude-path` for each module path.
- Review and commit the files like any other change. Commit them with a type that does not release (e.g. `docs:`).

## Single shared tag

With `linked-versions` and `linked-tags: single` ([Monorepos](/configuration/monorepos#linked-versions)) all packages of a
group use the existing tags (e.g. `v1.2.3`), so no further tags are needed. You can skip the rest of this page.

## Add component tags

This only applies if packages are released with their own tags (the default). relwolf finds the last release of a package by its tag. In a monorepo a package with a `component` only knows tags like
`orders-v1.2.3`. Without such a tag, the first run treats the whole history as unreleased: the changelog entry becomes huge
and the version is computed from `0.0.0` (with [linked versions](/configuration/monorepos#linked-versions) the highest
version still wins).

Tag the last release commit once per package, using the version of your last release:

```sh
git tag orders-v1.2.3 v1.2.3
git tag core-v1.2.3 v1.2.3
git push origin orders-v1.2.3 core-v1.2.3
```

The tag format follows [`tag-template`](/configuration/relwolf-yaml#tags-and-release-names).

As an alternative, `bootstrap-sha: <last release commit>` ignores all history before that commit for packages without a tag.
Packages that already have a tag are not affected.

## Check before merging

The first release request should contain only commits since the last release. If it does not, check the tags
(`git tag --merged HEAD`) and the `tag-template`.

See [Monorepos](/configuration/monorepos#example-multi-module-gradle-project-with-axion-release) for a complete example.
