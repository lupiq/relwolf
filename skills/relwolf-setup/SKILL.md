---
name: relwolf-setup
description: Set up relwolf (automated releases from Conventional Commits or Changesets, with a release merge/pull request, tags and releases) in the current repository. Analyzes whether it is a single project or a monorepo, asks for the preferred configuration, and creates relwolf.yaml, the GitHub Actions workflow or GitLab CI job and optional commit linting. Use when the user wants to add, install, configure or migrate to relwolf.
---

# Set up relwolf

You configure [relwolf](https://relwolf.lupiq.io) for the repository you are started in. The documentation at
`https://relwolf.lupiq.io` and the JSON schema `https://relwolf.lupiq.io/schema.json` are the source of truth; fetch
them when a detail is unclear instead of guessing.

## Rules

- **Interview first, write later.** Do not create or change any file before the user confirmed the summary (step 4).
- Do not commit, push, tag or create branches. At the end suggest a commit message (Conventional Commits, e.g.
  `build(release): Add relwolf`).
- Never write secrets (tokens, webhook URLs, private keys) into files. Only tell the user which secret or variable to
  create and where.
- Do not assume on open questions - ask. Offer a recommended default for every question.
- relwolf has no CLI flags or subcommands; everything is configured in `relwolf.yaml`. Unknown keys are rejected.
- Keep existing files intact: merge into an existing `relwolf.yaml`, workflow or `.gitlab-ci.yml` instead of
  replacing it, and show what changes.

## Steps

### 1. Analyze the repository

Follow [references/detection.md](references/detection.md). Find out:

- the platform (GitHub or GitLab, from the git remote and existing CI files) and the default branch,
- single project or monorepo, and the list of candidate packages with path, component name and updater type,
- existing release tooling to replace or migrate from (release-please, semantic-release, changesets, standard-version),
- whether the history uses Conventional Commits, whether tags exist, whether the clone is complete,
- existing commit linting, formatter and CI.

Tell the user briefly what you found.

### 2. Ask about the configuration

First ask how deep the setup should go (recommended: minimal):

- **Minimal**: only what is needed to get relwolf running. Ask about topics 1-3 and 9 below (strategy, packages and
  monorepo mode, version files, CI job and token). Everything else keeps relwolf's defaults and is not written to
  `relwolf.yaml`. Detected facts are used without asking (default branch, existing tag format as `tag-template`, existing
  `cliff.toml`, a formatter as `pre-commit-script` only if the repository checks formatting). Mention at the end that
  topics 4-8 and 10 can be added later and where they are documented.
- **Full**: ask about every topic below that applies.

Ask one topic at a time with the available question tool, preselecting the recommended option. Skip topics that do
not apply. Details, defaults and the mapping to `relwolf.yaml` keys are in [references/options.md](references/options.md).

Topics (the numbers are referenced above):

1. Strategy (`conventional-commits` or `changesets`).
2. Packages: which to release, components (tag prefixes), monorepo mode (independent, separate requests, linked
   versions, single linked tag).
3. Version files (updaters), lockfiles and `x-relwolf-*` marker files.
4. Versioning: initial version, pre-release channel, `bump-minor-pre-major`, `patch-types`/`minor-types`.
5. Changelog: path, title, `cliff.toml`, links, emoji, formatter via `pre-commit-script`.
6. Release request: title, labels, draft, assignees, reviewers.
7. AI release notes (optional): provider, model, context, language, audience, outputs.
8. Messages (optional): Slack, Teams or generic webhook.
9. CI: GitHub workflow or GitLab job, token type. See [references/ci-github.md](references/ci-github.md) and
   [references/ci-gitlab.md](references/ci-gitlab.md).
10. Commit linting (only with Conventional Commits): see [references/commit-lint.md](references/commit-lint.md).

### 3. Prepare the changes

List every file to create or modify (`relwolf.yaml`, CI file, `cliff.toml`, `scripts/*.sh`, commitlint config, hooks)
and prepare the content in memory. Check it against [references/validation.md](references/validation.md).

### 4. Confirm

Show a summary: the resulting `relwolf.yaml`, every other file with a short diff or content preview, and the manual
steps from step 6. Ask for confirmation. Only continue on a clear yes; offer to adjust answers otherwise.

### 5. Write and validate

Write the files. Validate as described in [references/validation.md](references/validation.md) and fix problems.

### 6. Hand off

Print a checklist of what only the user can do:

- Create the token and store it as `RELWOLF_TOKEN` (GitHub: secret, or a GitHub App with the `RELWOLF_APP_CLIENT_ID`
  variable and the `RELWOLF_APP_PRIVATE_KEY` secret; GitLab: masked CI/CD variable).
- Repository settings: GitHub - allow squash merging only, auto-delete head branches. GitLab - merge method
  _Fast-forward merge_ with _Squash_, delete source branch by default.
- Optional secrets: `COPILOT_GITHUB_TOKEN` or `RELWOLF_AI_API_KEY` for AI release notes,
  `RELWOLF_MESSAGE_WEBHOOK_URL` (or the configured variable) for messages.
- relwolf needs a full clone with all tags; the first release request appears after the next push to the default
  branch with releasable commits.
- The suggested commit message. Do not commit it yourself.
