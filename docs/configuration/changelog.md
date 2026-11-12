---
title: Changelog with git-cliff
description: Control the format of your release changelog with a cliff.toml. relwolf generates changelogs with git-cliff from Conventional Commits.
---

# Changelog (git-cliff)

relwolf delegates all changelog formatting to [git-cliff](https://git-cliff.org/) (bundled via npm). Put a `cliff.toml`
into your repository to control groups, templates, header and footer. Which commit types appear in the changelog is
purely git-cliff configuration.

- relwolf passes the file with `--config` when you set `cliff-config`; otherwise git-cliff finds `cliff.toml` in the
  repository root on its own.
- relwolf adds `--tag`, `--tag-pattern`, `--include-path`/`--exclude-path` and the commit range, and prepends the entry
  to the changelog file.
- Packages that were only bumped to follow linked versions get the [`no-changes-text`](/configuration/relwolf-yaml#release-request)
  placeholder instead of an empty entry.
- git-cliff's [GitLab](https://git-cliff.org/docs/integration/gitlab) and
  [GitHub](https://git-cliff.org/docs/integration/github) integrations (`remote` context such as PR/MR numbers and
  usernames) work out of the box: relwolf passes `RELWOLF_TOKEN` to git-cliff as `GITLAB_TOKEN` or `GITHUB_TOKEN`
  (depending on the provider) and, on GitLab, `CI_API_V4_URL` as `GITLAB_API_URL`. Variables you set yourself take
  precedence. The token is only used when your `cliff.toml` uses the integration.
- Use `RELWOLF_GIT_CLIFF` to run your own git-cliff executable instead of the bundled one.
- **Release emoji**: relwolf passes the emoji of the release title (see `release-emoji`, also if you add one by hand
  in the release request) as `RELWOLF_RELEASE_EMOJI` to git-cliff; it is empty without one. Use it in your `cliff.toml`,
  e.g. <code v-pre>{{ get_env(name="RELWOLF_RELEASE_EMOJI", default="") }}</code>. Only the new release gets it: entries that were
  already released (also when [rewriting](#rewrite-the-whole-changelog)) are rendered without an emoji.
- **Package-specific title** (monorepos): write `${component}` into the `header` of your `cliff.toml`, e.g.
  `header = "# Changelog ${component}\n"`; relwolf replaces it with the package's `component` (empty without one).
  Alternatively set `changelog-title` per package in `relwolf.yaml`; it replaces the leading `# ` heading produced by
  your header and also supports `${component}`.

## Links to component changelogs

With `changelog-links: true` (monorepos), relwolf writes a list of links to the changelogs of all other packages below
the title of the changelog of the root package (path `.`), labelled with the `component`. The text above the list is
`changelog-links-text`. The block sits between `<!-- relwolf:changelog-links:start -->` and `…:end -->` and is replaced on
every release of the root package.

::: warning
Release merge requests are titled `chore(release): Create release …` (see `pull-request-title`). Make sure your `cliff.toml` does not list that commit
in the changelog (relwolf's own `cliff.toml` skips all `chore` commits).
:::

## Rewrite the whole changelog

relwolf only prepends the new entry, so changes to your `cliff.toml` (templates, groups, …) do not affect existing
entries. With `rewrite-changelog: true`, the next release regenerates the complete changelog of every released package
from the full history (from `bootstrap-sha`, if set) as soon as the git-cliff config (`cliff-config`, default
`cliff.toml`) differs from its state at the package's previous release tag. Later releases prepend again. Manual edits of
existing entries are lost when this happens. Releases without changes in a package (linked versions) are restored
with the current `no-changes-text`, so changing the text and the config regenerates them too. A release counts as empty if none of its commits shows up in
the entry, e.g. because they are all skipped by the git-cliff config. Each release is rendered on its own, from the
previous release tag. Without `bootstrap-sha`, the root commit of the repository is not part of the first release. The
job log tells when a changelog is rewritten.

## Example: everything except chores

```toml [cliff.toml]
[git]
conventional_commits = true
filter_unconventional = true
commit_parsers = [
  { message = "^chore", skip = true },
  { message = "^feat", group = "Features" },
  { message = "^fix", group = "Bug Fixes" },
  { message = "^doc", group = "Documentation" },
]
```

See the [git-cliff documentation](https://git-cliff.org/docs/configuration) for templates, links to diffs and
contributor sections. relwolf's own [cliff.toml](https://github.com/lupiq/relwolf/blob/main/cliff.toml) is a complete
example with diff links and a "Special thanks" section.
