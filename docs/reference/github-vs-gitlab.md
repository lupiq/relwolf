---
title: GitHub vs. GitLab
description: Differences between relwolf on GitHub and GitLab - tokens, labels, merge strategies, releases and pre-release handling at a glance.
---

# GitHub vs. GitLab

relwolf's hosting platform is an interface with two implementations. The provider is auto-detected from `GITLAB_CI` /
`GITHUB_ACTIONS`, or set with `RELWOLF_PROVIDER`.

| Topic                 | GitLab                                          | GitHub                                               |
| --------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Run relwolf with      | Docker image as `image:` of a CI job            | `lupiq/relwolf` GitHub Action (Linux runners)        |
| Release request       | Merge request                                   | Pull request                                         |
| Token variable        | CI/CD variable `RELWOLF_TOKEN` (masked)         | Repository secret `RELWOLF_TOKEN`, passed as `token` |
| Token type            | Personal/project access token, scope `api`      | Personal access token or `GITHUB_TOKEN`              |
| Full clone            | `GIT_DEPTH: 0`                                  | `fetch-depth: 0`                                     |
| Prevent parallel runs | `resource_group: relwolf`                       | `concurrency: group: release`                        |
| Merge method          | Fast-forward merge + Squash                     | Squash merging only                                  |
| Force a version       | Run pipeline with variable `RELWOLF_RELEASE_AS` | Action input `release-as` (e.g. `workflow_dispatch`) |
| Draft request         | Title prefix `Draft:`                           | Draft pull request                                   |
| Pre-release flag      | Not available (hint ignored)                    | Releases are flagged as pre-release                  |
| Self-managed          | Supported (`CI_API_V4_URL`)                     | GitHub Enterprise via `GITHUB_API_URL`               |

## Side-by-side setup

::: code-group

```yaml [GitLab]
relwolf:
  image: ghcr.io/lupiq/relwolf:0 # x-relwolf-major
  stage: release
  resource_group: relwolf
  variables:
    GIT_DEPTH: 0
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - relwolf
```

```yaml [GitHub]
name: Release
on:
  push:
    branches: [main]
concurrency:
  group: release
permissions:
  contents: write
  pull-requests: write
jobs:
  relwolf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: lupiq/relwolf@v0 # x-relwolf-major
        with:
          token: ${{ secrets.RELWOLF_TOKEN }}
```

:::

relwolf releases itself with the GitHub provider (`.github/workflows/release.yml`).

## Other platforms

The provider layer is replaceable: implement the `Provider` interface (`src/providers/types.ts`) and extend
`providers/index.ts`. See [Contributing](/development/).
