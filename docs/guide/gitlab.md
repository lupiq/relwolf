---
title: Release automation for GitLab CI
description: Set up relwolf as a GitLab CI job to open release merge requests from Conventional Commits, tag merged releases and create GitLab releases.
---

# GitLab

Works with gitlab.com and self-managed instances.

## 1. Create a token

Create a **personal or project access token** with the `api` scope and role Developer or higher. It must be able to push
the branch `relwolf/main`, create merge requests, tags and releases.

Store it as a masked CI/CD variable named **`RELWOLF_TOKEN`** (required; relwolf aborts without it). GitLab exposes
CI/CD variables to the job as environment variables, so the job needs no further configuration for it.

## 2. Project settings

- Merge method **Fast-forward merge** with **Squash** enabled (relwolf assumes there are no merge commits).
- _Delete source branch_ as default is recommended.

## 3. Add the job

```yaml [.gitlab-ci.yml]
relwolf:
  image: ghcr.io/lupiq/relwolf:0 # x-relwolf-major
  stage: release
  resource_group: relwolf
  variables:
    GIT_DEPTH: 0 # relwolf needs the full history and all tags
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - relwolf
```

The image has no `ENTRYPOINT`, so `relwolf` is simply a command on the `PATH`. `resource_group` prevents two relwolf
jobs from running at the same time.

::: tip Image tags
`:1` follows the latest stable release of major version 1. Use `:1.2` or `:1.2.3` to pin more strictly. See
[Docker image](/reference/docker-image).
:::

## 4. Configure (optional)

Add a [`relwolf.yaml`](/configuration/) to the repository root to update version files, set a pre-release channel or
configure a monorepo.

## Forcing a version

Run a pipeline manually (_Build → Pipelines → Run pipeline_) on the default branch with the variable
`RELWOLF_RELEASE_AS=1.0.0`. See [Controlling the next version](/guide/release-as).

## What you will see

- A merge request `chore(release): Create release v1.2.3` from `relwolf/main`, labelled `relwolf: pending`.
- After the merge: the tag `v1.2.3`, a GitLab release with the changelog entry and the label `relwolf: tagged`.
