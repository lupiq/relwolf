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
  targets: [changelog, file] # changelog (default), file or both
  file: docs/release-summaries.md # required for the target "file"
  language: English
```

::: warning Data leaves your repository
The release notes and the full commit messages of the release are sent to the configured AI endpoint. Only enable
this with an endpoint you trust with that content.
:::

## Provider

relwolf talks to any OpenAI-compatible `/chat/completions` API with plain HTTP.

- **GitHub:** by default [GitHub Models](https://docs.github.com/en/github-models) (`openai/gpt-4.1-mini`, free but
  rate limited, no Claude models). It uses `RELWOLF_AI_API_KEY`, `GITHUB_TOKEN` or `RELWOLF_TOKEN` (first one set).
  The token needs the permission `models: read`; in GitHub Actions add `models: read` to the `permissions` of the job.
- **Everything else** (GitLab, other models such as Claude through a compatible gateway, OpenAI, Azure OpenAI, Ollama,
  …): set `base-url` and `model` and pass the API key as `RELWOLF_AI_API_KEY`.

```yaml [relwolf.yaml]
ai-summary:
  enabled: true
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

## Prompt

`prompt` replaces the built-in instructions. The placeholders `${language}`, `${tag}`, `${version}` and `${component}`
are replaced. The model gets the release notes and the commit messages (up to 30,000 characters) as input.

## Options

| Key          | Default                               | Description                               |
| ------------ | ------------------------------------- | ----------------------------------------- |
| `enabled`    | `false`                               | Turn the feature on                       |
| `base-url`   | GitHub Models on GitHub               | OpenAI-compatible API; required elsewhere |
| `model`      | `openai/gpt-4.1-mini` (GitHub Models) | Model name; required with `base-url`      |
| `language`   | `English`                             | Language of the summary                   |
| `prompt`     | built in                              | Instructions for the model                |
| `targets`    | `[changelog]`                         | `changelog`, `file` or both               |
| `file`       | none                                  | Markdown file for the target `file`       |
| `file-title` | `Release summaries`                   | First-level heading of that file          |
