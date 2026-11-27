# GitHub Actions

Create `.github/workflows/release.yml` (or add the job to an existing release workflow). relwolf runs as a Docker
container action on **Linux runners** only.

```yaml
name: Release
on:
  push:
    branches: [main] # the default branch
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
          fetch-depth: 0 # relwolf needs the full history and all tags
      - uses: lupiq/relwolf@v0 # x-relwolf-major
        with:
          token: ${{ secrets.RELWOLF_TOKEN }}
```

Check the current `actions/checkout` major version used elsewhere in the repository and reuse it. Keep `@v0 # x-relwolf-major`
as it is written here (the comment is a marker relwolf's own release uses) unless the docs at
https://relwolf.lupiq.io/guide/github show a newer major.

## Token (ask which one)

| Token                               | Use                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal access token (recommended) | Repository secret `RELWOLF_TOKEN`; fine-grained with contents and pull requests read/write                                                                                                        |
| GitHub App                          | Not tied to a person; add the `actions/create-github-app-token` step, see below                                                                                                                   |
| Built-in `GITHUB_TOKEN`             | `token: ${{ secrets.GITHUB_TOKEN }}`; needs _Allow GitHub Actions to create and approve pull requests_; CI does not run on the release pull request and tag pushes do not trigger other workflows |

GitHub App step (before relwolf):

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

The app needs _Contents_ and _Pull requests_ read and write. Creating it is a manual step; point the user to
https://relwolf.lupiq.io/guide/github#alternative-github-app.

## Optional environment variables

Pass them to the relwolf step with `env:` (the action has no inputs for them):

```yaml
env:
  COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }} # AI release notes with copilot-cli
  RELWOLF_AI_API_KEY: ${{ secrets.RELWOLF_AI_API_KEY }} # AI provider openai / anthropic
  RELWOLF_MESSAGE_WEBHOOK_URL: ${{ secrets.RELWOLF_MESSAGE_WEBHOOK_URL }} # messages
  RELWOLF_GENERATE_AI_RELEASE_NOTES: ${{ inputs.generate_ai_release_notes }} # with generate: manual
```

For `generate: manual` add a `workflow_dispatch` trigger with a boolean input and pass it as shown. For forcing a
version see https://relwolf.lupiq.io/guide/release-as (`RELWOLF_RELEASE_AS`).

## Pre-commit script

The action runs in the relwolf Docker image: tools installed by earlier workflow steps (pnpm, Maven, ...) are not
available to the `pre-commit-script`; only what the image contains (Node, npm, git, a POSIX shell). Prefer a script
that only needs those, or `npx --yes <tool>`. If it needs more, tell the user and ask how to proceed instead of
guessing (for example running the image with `docker run` and mounting the workspace).

## Repository settings (manual)

Allow squash merging only; enable _Automatically delete head branches_.
