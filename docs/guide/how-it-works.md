---
title: How relwolf works
description: Understand the two phases of a relwolf run - tagging merged releases and preparing the release merge request - and how state is kept.
---

# How it works

Each run executes two phases.

## 1. Tag merged releases

Merge requests labelled `relwolf: pending` that were merged into the default branch get their tag created on the commit
the merge produced (the squash commit) and a release published. The notes are taken from the merge request description,
so you can edit them before merging. Afterwards the label is switched to `relwolf: tagged`.

Every step is idempotent, so a failed job can simply be re-run.

## 2. Prepare the next release

For every configured package, the commits since the last release tag are analysed. If something releasable happened,
relwolf

- generates the new changelog entry with [git-cliff](https://git-cliff.org/),
- updates the version in the configured files,
- force-pushes a single commit to `relwolf/<branch>` through the API (the working tree is never modified),
- creates or updates the merge request `chore(release): prepare for v1.2.3` labelled `relwolf: pending`.

## Skipped pipelines

Pipelines that are not branch pipelines for the default branch (merge request pipelines, tag pipelines, other branches)
are skipped without an error.

## The merge request is the state

The release merge request body stores the release notes (between hidden `relwolf:notes` markers), the base commit and
an optional [version request](/guide/release-as). If title and body are identical to the new result, nothing is
recommitted. There is no database and no other state.

## Git access

The CI job provides a full git clone. Git is used **read-only**; all writes (branch commit, merge request, labels, tags,
releases) go through the provider API.

## Example timeline

```text
feat: add search        → release MR "prepare for v0.1.0" opened
fix: typo               → release MR updated (still v0.1.0, changelog has both)
(release MR merged)     → tag v0.1.0 + release created
fix: crash on start     → release MR "prepare for v0.1.1" opened
```
