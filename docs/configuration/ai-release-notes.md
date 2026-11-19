---
title: AI release notes
description: Let an AI model summarize every release in the release request, the changelog, the release notes and additional Markdown files.
---

# AI release notes

relwolf can ask an AI model for release notes for every release. The notes are part of the release request, so you
can read and edit them before you merge. The feature is **disabled by default**: it is on as soon as `changelog` is set
(release notes in the changelog) or `additional-files` has at least one entry. The other options are only defaults for
these outputs, so you do not have to repeat them; without `changelog` and `additional-files` they are an error.

```yaml [relwolf.yaml]
ai-release-notes:
  # Defaults for the changelog and every file
  context: changelog # changelog, commits (default) or full-diff
  audience: users # free text, e.g. users (default), developers or product managers
  exclude-paths: ['**/*.lock', 'generated/**'] # applies to full-diff
  language: English
  changelog: true # release notes in the changelog and the release
  additional-files:
    - file: docs/release-summaries.md
    - file: docs/de/release-summaries.md
      language: German
      audience: developers
      prompt: Summarize release ${tag} in ${language} for ${audience}.
```

::: warning Data leaves your repository
The configured release context is sent to the Copilot CLI or the configured AI endpoint. `changelog` sends only the generated
changelog content, `commits` sends all commit messages and bodies, and `full-diff` sends the code diff since the previous release.
Only enable this with an endpoint you trust with that content.
:::

## Provider

`provider` selects how the release notes are generated.

- **`copilot-cli`** (default): runs the [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
  in programmatic mode, so it uses your Copilot subscription. The Docker image (GitHub Action and GitLab CI) already
  contains it; when you run relwolf without the image, install it
  (`npm install --global @github/copilot`) or point `RELWOLF_COPILOT_CLI` to the executable. It authenticates with
  `RELWOLF_AI_API_KEY` or `COPILOT_GITHUB_TOKEN`, which you provide as a secret in the job environment: a fine-grained
  personal access token of a Copilot subscriber with the account permission **Copilot Requests**. relwolf runs the CLI in an empty temporary directory, without any tool
  permission and without custom instructions, and removes all other tokens from its environment. `model` is optional
  and defaults to the one of the CLI.
- **`openai`**: any OpenAI-compatible `/chat/completions` API (OpenAI, Azure OpenAI, Ollama, a gateway for Claude, …)
  over plain HTTP. `base-url` and `model` are required, the key comes from `RELWOLF_AI_API_KEY`.
- **`anthropic`**: the [Claude API](https://docs.anthropic.com/en/api/messages) (`/messages`) directly. `model` is
  required (e.g. `claude-sonnet-4-5`), `base-url` defaults to `https://api.anthropic.com/v1`, the key comes from
  `RELWOLF_AI_API_KEY`.

```yaml [relwolf.yaml]
ai-release-notes:
  provider: openai
  base-url: https://api.openai.com/v1
  model: gpt-4.1-mini
```

```yaml [relwolf.yaml]
ai-release-notes:
  provider: anthropic
  model: claude-sonnet-4-5
```

## Outputs

`changelog` adds the release notes to the new changelog entry above its first `###` section (at the end without one) and
above the notes of the created release. Set it to `true` or to an object with its own options (see below) and
`packages` / `exclude-packages`. Without it, `additional-files` alone only writes files.

Every entry of `additional-files` writes its own release notes to a Markdown file: a new entry with the release icon,
linked version, date, and release notes is prepended below the `# <file-title>` heading of `file` (created if
missing), e.g. for a documentation page. An entry accepts `file` (required), `file-title` and all other options
(`provider`, `base-url`, `model`, `context`, `audience`, `exclude-paths`, `language`, `input-price`, `output-price`, `prompt`). Options that an entry
leaves out are inherited from `ai-release-notes`, so you can create files for several audiences and languages, each with its
own prompt. Every output is generated separately.

### Monorepos

By default every package gets release notes in every output. `file` may contain `${path}` (the package path, `.` for
the root) and `${component}` (the component name, `root` without one), which writes one file per package, e.g.
`file: ${path}/RELEASE_NOTES.md`. Without a placeholder all packages share the file and the headings show the component.

`packages` and `exclude-packages` limit an output to packages, given as component name or path. They are set in `changelog`
and in each entry of `additional-files`.

```yaml [relwolf.yaml]
ai-release-notes:
  changelog:
    exclude-packages: [internal] # no notes in the changelog of this package
  additional-files:
    - file: ${path}/RELEASE_NOTES.md
      exclude-packages: [internal, tools]
```

The changelog notes cannot be combined with `rewrite-changelog`, which would drop the summaries of older releases. In
monorepos every package gets its own release notes. `strategy: changesets` is not supported yet.

## Release request

The release notes are rendered between hidden `relwolf:summary` markers in the release request:

- Every block names what it is generated for: the tag, the package, and the changelog (and release) or the file.
- It is generated again whenever the commits of the release (or the model, language or prompt) change, so it is always
  up to date when you merge.
- If you edit the text, relwolf keeps your version. Clear the text to leave the release notes out. A new version (new tag)
  starts with fresh release notes.
- If the model cannot be reached or answers with an error, the release goes on without new release notes and the request
  shows a warning with the reason. The next run tries again.

## Generating on request

Model calls cost money. With `generate: manual` (top level of `ai-release-notes`, default `always`), relwolf only
calls the model in a run where the variable `RELWOLF_GENERATE_AI_RELEASE_NOTES=true` is set, e.g. a manually started
pipeline (GitLab: _Run pipeline_ with that variable) or workflow run (GitHub: a `workflow_dispatch` input that you map
to the variable) just before you merge the release request.

```yaml [relwolf.yaml]
ai-release-notes:
  generate: manual
  changelog: true
```

- Without the variable, the release request shows a warning that the release notes still have to be generated before
  merging.
- Release notes that were generated earlier stay in the request; if the commits changed since, they are marked as
  stale in a warning (and still used until you generate them again). Edited release notes are kept as usual.
- A run with the variable generates only the missing or outdated release notes.
- If you merge without generating, the release has no (or stale) release notes.

## Token usage and cost

With `usage-comment: true` (top level of `ai-release-notes`, default `false`), relwolf adds a comment to the release request (hidden `relwolf:usage` marker) with the
input and output tokens and the cost of the last run and, if there were several runs, of all runs of
the release request. The comment is updated in place; a new release request starts counting again. Runs that do not
call the model leave it untouched.

- Tokens are reported by the provider: `openai`, `anthropic`, and the Copilot CLI (all models it used, including
  cached input). If a provider reports nothing, no comment is written.
- With `copilot-cli` the cost is the AI credits GitHub Copilot billed for the call, as reported by the CLI; no prices
  needed.
- With `openai` and `anthropic` (or additionally with `copilot-cli`) the cost is an estimate in USD, shown if
  `input-price` and/or `output-price` (USD per million tokens) are set. Relwolf has no price table, so it is only as
  accurate as your prices. Without credits and prices the cost shows `–`.
- The token counts are also written to the job log. If the comment cannot be written (e.g. missing permissions to
  comment), the release goes on and the reason is logged.

## Context and audience

`context` controls what the model sees:

| Context     | Content                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `changelog` | Only the generated changelog content, excluding commits that do not appear in the changelog |
| `commits`   | All commit messages and bodies since the previous release (default)                         |
| `full-diff` | The full package-scoped code diff since the previous release                                |

`audience` is free text and `users` by default. Set it to `developers` for more technical release notes focused on APIs,
configuration, migrations, and compatibility, or to any audience of your own such as `product managers`. The text is
passed to the model as `${audience}`. All audiences get important breaking changes highlighted first, including newly
added, changed, or removed properties.

`exclude-paths` removes matching repository-relative glob paths from the `full-diff` context. It does not change
which commits or changelog entries are used for the release itself.

## Prompt

`prompt` replaces the built-in instructions. The placeholders `${language}`, `${tag}`, `${version}`, `${component}` and
`${audience}` are replaced. The model gets the selected context (up to 30,000 characters) as input.
The built-in prompt uses Markdown without headings and bolds important features, breaking changes, APIs, options, and
compatibility details.

## Options

Top level (defaults), `changelog` and every entry of `additional-files` (unset options are inherited from the top level):

| Key             | Default       | Description                                                |
| --------------- | ------------- | ---------------------------------------------------------- |
| `provider`      | `copilot-cli` | `copilot-cli`, `openai` or `anthropic`                     |
| `base-url`      | none          | API URL; required with `openai`, optional with `anthropic` |
| `model`         | CLI default   | Model name; required with `openai` and `anthropic`         |
| `context`       | `commits`     | `changelog`, `commits` or `full-diff`                      |
| `audience`      | `users`       | Free text, e.g. `users`, `developers`, `product managers`  |
| `exclude-paths` | `[]`          | Globs excluded from the `full-diff` context                |
| `language`      | `English`     | Language of the release notes                              |
| `input-price`   | none          | USD per million input tokens, for the cost estimate        |
| `output-price`  | none          | USD per million output tokens, for the cost estimate       |
| `prompt`        | built in      | Instructions for the model                                 |

Only in `changelog` and `additional-files` entries:

| Key                | Default      | Description                                       |
| ------------------ | ------------ | ------------------------------------------------- |
| `packages`         | all packages | Only these packages (component name or path)      |
| `exclude-packages` | none         | Leave out these packages (component name or path) |

Only in `ai-release-notes`: `changelog` (`true` or an object, adds the notes to the changelog), `additional-files`,
`generate` (`always` by default, or [`manual`](#generating-on-request)) and
`usage-comment` (`true` adds the [token usage comment](#token-usage-and-cost); default `false`).

Only in `additional-files` entries:

| Key          | Default             | Description                                   |
| ------------ | ------------------- | --------------------------------------------- |
| `file`       | required            | Markdown file that gets the release notes     |
| `file-title` | `Release summaries` | First-level heading of the release notes file |
