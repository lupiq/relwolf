---
title: AI release summary
description: Let an AI model summarize every release in the release request, the changelog, the release notes and a separate Markdown file.
---

# AI release summary

relwolf can ask an AI model for a short summary of every release. The summary is part of the release request, so you
can read and edit it before you merge. It is **disabled by default**.

```yaml [relwolf.yaml]
ai-summary:
  enabled: true
  context: changelog # changelog, commits (default) or full-diff
  audience: users # users (default) or developers
  exclude-paths: ['**/*.lock', 'generated/**'] # applies to full-diff
  targets: [changelog, file] # changelog (default), file or both
  file: docs/release-summaries.md # required for the target "file"
  language: English
```

::: warning Data leaves your repository
The configured release context is sent to the Copilot CLI or the configured AI endpoint. `changelog` sends only the generated
changelog content, `commits` sends all commit messages and bodies, and `full-diff` sends the code diff since the previous release.
Only enable this with an endpoint you trust with that content.
:::

## Provider

`provider` selects how the summary is generated.

- **`copilot-cli`** (default): runs the [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
  in programmatic mode, so it uses your Copilot subscription. Install it in the job
  (`npm install --global @github/copilot`) or point `RELWOLF_COPILOT_CLI` to the executable. It authenticates with
  `RELWOLF_AI_API_KEY` or `COPILOT_GITHUB_TOKEN`: a fine-grained personal access token of a Copilot subscriber with
  the account permission **Copilot Requests**. relwolf runs the CLI in an empty temporary directory, without any tool
  permission and without custom instructions, and removes all other tokens from its environment. `model` is optional
  and defaults to the one of the CLI.
- **`openai`**: any OpenAI-compatible `/chat/completions` API (OpenAI, Azure OpenAI, Ollama, a gateway for Claude, …)
  over plain HTTP. `base-url` and `model` are required, the key comes from `RELWOLF_AI_API_KEY`.

```yaml [relwolf.yaml]
ai-summary:
  enabled: true
  provider: openai
  base-url: https://api.openai.com/v1
  model: gpt-4.1-mini
```

## Targets

| Target      | Effect                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changelog` | The summary is added to the new changelog entry above its first `###` section (at the end without one) and above the notes of the created release.                  |
| `file`      | A new entry `## <version> - <date>` with the summary is prepended below the `# <file-title>` heading of `file` (created if missing), e.g. for a documentation page. |

`changelog` cannot be combined with `rewrite-changelog`, which would drop the summaries of older releases. In
monorepos every package gets its own summary. `strategy: changesets` is not supported yet.

## Release request

The summary is rendered between hidden `relwolf:summary` markers in the release request:

- It is generated again whenever the commits of the release (or the model, language or prompt) change, so it is always
  up to date when you merge.
- If you edit the text, relwolf keeps your version. Clear the text to leave the summary out. A new version (new tag)
  starts with a fresh summary.
- If the model cannot be reached or answers with an error, the release goes on without a (new) summary and the request
  shows a warning with the reason. The next run tries again.

## Context and audience

`context` controls what the model sees:

| Context     | Content                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `changelog` | Only the generated changelog content, excluding commits that do not appear in the changelog |
| `commits`   | All commit messages and bodies since the previous release (default)                         |
| `full-diff` | The full package-scoped code diff since the previous release                                |

`audience` is `users` by default. Set it to `developers` for a more technical summary focused on APIs,
configuration, migrations, and compatibility. Both audiences get important breaking changes highlighted first,
including newly added, changed, or removed properties.

`exclude-paths` removes matching repository-relative glob paths from the `full-diff` context. It does not change
which commits or changelog entries are used for the release itself.

## Prompt

`prompt` replaces the built-in instructions. The placeholders `${language}`, `${tag}`, `${version}`, `${component}` and
`${audience}` are replaced. The model gets the selected context (up to 30,000 characters) as input.
The built-in prompt uses Markdown without headings and bolds important features, breaking changes, APIs, options, and
compatibility details.

## Options

| Key             | Default             | Description                                 |
| --------------- | ------------------- | ------------------------------------------- |
| `enabled`       | `false`             | Turn the feature on                         |
| `provider`      | `copilot-cli`       | `copilot-cli` or `openai`                   |
| `base-url`      | none                | OpenAI-compatible API; only with `openai`   |
| `model`         | CLI default         | Model name; required with `openai`          |
| `context`       | `commits`           | `changelog`, `commits` or `full-diff`       |
| `audience`      | `users`             | `users` or `developers`                     |
| `exclude-paths` | `[]`                | Globs excluded from the `full-diff` context |
| `language`      | `English`           | Language of the summary                     |
| `prompt`        | built in            | Instructions for the model                  |
| `targets`       | `[changelog]`       | `changelog`, `file` or both                 |
| `file`          | none                | Markdown file for the target `file`         |
| `file-title`    | `Release summaries` | First-level heading of that file            |
