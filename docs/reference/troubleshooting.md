---
title: Troubleshooting
description: Fix common relwolf problems such as shallow clone errors, missing tags, permissions and release merge requests that are not updated.
---

# Troubleshooting

## Token problems (401, 403, 404)

Failed API calls print a `Hint:` with the likely cause:

- **401**: the token is invalid, expired or revoked, or belongs to another instance.
- **403**: the token lacks permissions. GitLab needs the `api` scope and the role Developer or higher; check protected
  branches (`relwolf/*`) and protected tags. GitHub needs _contents_ and _pull requests_ write access, see
  [GitHub](/guide/github#_1-create-a-token); branch protection and rulesets can block the request, too.
- **404**: the project or repository was not found, or the token cannot access it (both platforms answer 404 then).
  Check `CI_PROJECT_ID` / `GITHUB_REPOSITORY`.

A message such as `could not reach https://…` means a network problem or a wrong API URL.

## Shallow clone error

relwolf needs the full history and all tags. Set `GIT_DEPTH: 0` (GitLab) or `fetch-depth: 0` (GitHub checkout).

## Nothing happens

- The pipeline is not a branch pipeline for the default branch (merge request, tag or other branch pipelines are
  skipped).
- No releasable commit since the last tag. By default these are `feat`, `fix` and breaking changes; see
  [commit types](/configuration/relwolf-yaml#commit-types) and [Version rules](/guide/version-rules).
- The commits only touch paths in `exclude-paths` or another package.
- A [version request](/guide/release-as) was set but there is no new commit since the last tag.

## The tag is missing after merging

relwolf tags the resulting commit on the default branch. If it is not an ancestor of the current `HEAD` yet, the merge
request is skipped until a later run. Re-run the job; every step is idempotent.

## The tag already exists but points to another commit

The release tag was created before relwolf tagged the merge commit (by hand or by another tool). relwolf aborts
instead of publishing a release for a commit that is not the merged release request. Check the tag, then delete it or
move it to the merge commit named in the error and re-run the job.

## `RELWOLF_RELEASE_AS` is rejected

The version must be greater than the last tag. To remove a stored request, run once with `RELWOLF_RELEASE_AS=auto`.

## No CI on the release pull request (GitHub)

Events created with `GITHUB_TOKEN` do not trigger workflows. Use a personal access token or a
[GitHub App](/guide/github#alternative-github-app) token as `RELWOLF_TOKEN`.

## The release commit shows up in the changelog

Make sure your `cliff.toml` skips `chore` commits (or whatever type your `pull-request-title` uses), see
[Changelog](/configuration/changelog).
