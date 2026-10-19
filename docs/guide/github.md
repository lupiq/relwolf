---
title: Release automation for GitHub (Action)
description: Use the relwolf GitHub Action to open release pull requests from Conventional Commits, tag merged releases and publish GitHub releases.
---

# GitHub

relwolf is available as a Docker container action. It runs on **Linux runners** only.

## 1. Create a token

Store a token as the repository secret **`RELWOLF_TOKEN`**.

| Token                   | Permissions                                                                                                                          | Notes                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Personal access token   | _contents_ and _pull requests_ write                                                                                                 | Recommended: CI runs on the release pull request and the tag push triggers other workflows |
| Built-in `GITHUB_TOKEN` | `contents: write`, `pull-requests: write`, and _Allow GitHub Actions to create and approve pull requests_ in the repository settings | Events created with it do not trigger other workflows                                      |

## 2. Repository settings

- Allow **squash merging** only.
- Enable _Automatically delete head branches_.

## 3. Add the workflow

```yaml [.github/workflows/release.yml]
name: Release
on:
  push:
    branches: [main] # your default branch
concurrency:
  group: release
permissions:
  contents: write
  pull-requests: write
jobs:
  relwolf:
    runs-on: ubuntu-latest # Linux runners only (Docker container action)
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # relwolf needs the full history and all tags
      - uses: lupiq/relwolf@v0 # x-relwolf-major
        with:
          token: ${{ secrets.RELWOLF_TOKEN }}
```

The action runs the Docker image of the same version. The major tag (`@v1` above) follows the latest stable release of
that major version; use an exact tag such as `@v1.2.3` to pin.

## Action inputs

| Input        | Required | Description                                                                                   |
| ------------ | -------- | --------------------------------------------------------------------------------------------- |
| `token`      | yes      | Access token for all API calls (becomes `RELWOLF_TOKEN`)                                      |
| `release-as` | no       | Forces the version of the next release, see [Controlling the next version](/guide/release-as) |

## Forcing a version

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      release-as:
        description: 'Force the next version, e.g. 1.0.0 ("auto" removes a request)'
        required: false
        default: ''
# ...
- uses: lupiq/relwolf@v0 # x-relwolf-major
  with:
    token: ${{ secrets.RELWOLF_TOKEN }}
    release-as: ${{ inputs.release-as }}
```

Then start the workflow from the _Actions_ tab, or with `gh workflow run release.yml -f release-as=1.0.0`.

## Configure (optional)

Add a [`relwolf.yaml`](/configuration/) to the repository root.

## What you will see

- A pull request `chore(release): prepare for v1.2.3` from `relwolf/main`, labelled `relwolf: pending`.
- After the merge: the tag `v1.2.3`, a GitHub release with the changelog entry and the label `relwolf: tagged`.
