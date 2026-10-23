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
- Packages that were only bumped to follow linked versions get the [`no-changes-text`](/configuration/#release-request)
  placeholder instead of an empty entry.
- git-cliff's [GitLab](https://git-cliff.org/docs/integration/gitlab) and
  [GitHub](https://git-cliff.org/docs/integration/github) integrations (`remote` context such as PR/MR numbers and
  usernames) work out of the box: relwolf passes `RELWOLF_TOKEN` to git-cliff as `GITLAB_TOKEN` or `GITHUB_TOKEN`
  (depending on the provider) and, on GitLab, `CI_API_V4_URL` as `GITLAB_API_URL`. Variables you set yourself take
  precedence. The token is only used when your `cliff.toml` uses the integration.
- Use `RELWOLF_GIT_CLIFF` to run your own git-cliff executable instead of the bundled one.

::: warning
Release merge requests are titled `chore(release): Create release …` (see `pull-request-title`). Make sure your `cliff.toml` does not list that commit
in the changelog (relwolf's own `cliff.toml` skips all `chore` commits).
:::

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
