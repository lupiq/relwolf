# Troubleshooting

## Shallow clone error

relwolf needs the full history and all tags. Set `GIT_DEPTH: 0` (GitLab) or `fetch-depth: 0` (GitHub checkout).

## Nothing happens

- The pipeline is not a branch pipeline for the default branch (merge request, tag or other branch pipelines are
  skipped).
- No releasable commit (`feat`, `fix` or breaking change) since the last tag.
- A [version request](/guide/release-as) was set but there is no new commit since the last tag.

## The tag is missing after merging

relwolf tags the resulting commit on the default branch. If it is not an ancestor of the current `HEAD` yet, the merge
request is skipped until a later run. Re-run the job; every step is idempotent.

## `RELWOLF_RELEASE_AS` is rejected

The version must be greater than the last tag. To remove a stored request, run once with `RELWOLF_RELEASE_AS=auto`.

## No CI on the release pull request (GitHub)

Events created with `GITHUB_TOKEN` do not trigger workflows. Use a personal access token as `RELWOLF_TOKEN`.

## The release commit shows up in the changelog

Make sure your `cliff.toml` skips `chore` commits, see [Changelog](/configuration/changelog).
