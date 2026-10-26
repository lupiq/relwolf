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

### Alternative: GitHub App

A GitHub App is a good alternative to a personal access token: the release pull requests are authored by the app
(`your-app[bot]`) instead of a person, so maintainers can review and merge them. Tokens of an app also trigger other
workflows.

1. Open _Settings → Developer settings → GitHub Apps → New GitHub App_. Do this in the settings of the **organization**
   if the repository belongs to one, otherwise the app can only be installed on your personal account.
2. Enter a unique name (e.g. `acme-relwolf`, the name of your organization plus `relwolf`) and any homepage URL.
3. Disable _Webhook → Active_.
4. Set the repository permissions _Contents_, _Pull requests_ and _Issues_ (labels and assignees) to _Read and write_.
5. Under _Where can this GitHub App be installed?_ choose _Only on this account_ and create the app.
6. Copy the **Client ID** from the app page and store it as the repository variable `RELWOLF_APP_CLIENT_ID`.
7. Click _Generate a private key_ and store the content of the downloaded `.pem` file as the repository secret
   `RELWOLF_APP_PRIVATE_KEY`.
8. Open _Install App_ in the app settings and install it on the repository.

Then generate a token in the workflow with
[`actions/create-github-app-token`](https://github.com/actions/create-github-app-token):

```yaml
- uses: actions/create-github-app-token@v3
  id: app-token
  with:
    client-id: ${{ vars.RELWOLF_APP_CLIENT_ID }}
    private-key: ${{ secrets.RELWOLF_APP_PRIVATE_KEY }}
- uses: lupiq/relwolf@v0 # x-relwolf-major
  with:
    token: ${{ steps.app-token.outputs.token }}
```

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

Add a [`relwolf.yaml`](/configuration/relwolf-yaml) to the repository root.

## What you will see

With the default settings:

- A pull request `chore(release): Create release v1.2.3` from `relwolf/main`, labelled `relwolf: pending`.
- After the merge: the tag `v1.2.3`, a GitHub release with the changelog entry and the label `relwolf: tagged`.
