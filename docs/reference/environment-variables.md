---
title: Environment variables
description: All environment variables supported by relwolf - token, provider, API URL, release-as and CI context for GitLab and GitHub.
---

# Environment variables

| Variable                                                                    | Purpose                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `RELWOLF_TOKEN`                                                             | **Required.** Access token used for all API calls                              |
| `RELWOLF_PROVIDER`                                                          | `gitlab` or `github`; auto-detected from `GITLAB_CI` / `GITHUB_ACTIONS`        |
| `RELWOLF_RELEASE_AS`                                                        | Forces the next version, see [Controlling the next version](/guide/release-as) |
| `RELWOLF_GIT_CLIFF`                                                         | Path to a git-cliff executable instead of the bundled one                      |
| `GITLAB_TOKEN`, `GITHUB_TOKEN`, `GITLAB_API_URL`                            | Optional; passed to git-cliff, default to `RELWOLF_TOKEN` / `CI_API_V4_URL`    |
| `CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_COMMIT_BRANCH`, `CI_DEFAULT_BRANCH`   | GitLab CI (set by GitLab, works for gitlab.com and self-managed)               |
| `GITHUB_API_URL`, `GITHUB_REPOSITORY`, `GITHUB_REF_TYPE`, `GITHUB_REF_NAME` | GitHub Actions (set by GitHub)                                                 |

The CI variables are provided by the platform; you normally only set `RELWOLF_TOKEN` (and optionally
`RELWOLF_RELEASE_AS`).
