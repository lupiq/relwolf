---
title: Set up relwolf with an AI agent
description: Let your AI coding agent (GitHub Copilot, Claude Code, Codex, Cursor) analyze your repository and set up relwolf - relwolf.yaml, CI job and commit linting - with the relwolf-setup skill.
---

# Set up with AI

The **`relwolf-setup`** [agent skill](https://agentskills.io) lets your AI coding agent set up relwolf for you. It works
with every agent that supports the `SKILL.md` standard, for example GitHub Copilot, Claude Code, Codex and Cursor.

The skill

1. **analyzes** your repository: GitHub or GitLab, single project or monorepo, packages, version files, existing
   release tooling, tags, commit history, CI and commit linting,
2. **asks** you whether you want a **minimal** setup (strategy, packages, version files, CI job and token; everything
   else keeps the defaults) or a **full** one, and then about the features: strategy (Conventional Commits or Changesets), monorepo mode, updaters, versions,
   changelog, release request, [AI release notes](/configuration/ai-release-notes), [messages](/configuration/messages),
   the CI job and commit linting,
3. **shows a summary** of every file it will create or change, and only writes after you confirmed it,
4. **hands over a checklist** of the manual steps: token, repository settings and secrets.

It never commits or pushes, and it never writes secrets into files.

## Install the skill

Install it into your repository (or your user profile) with the [skills CLI](https://skills.sh):

```sh
npx skills add lupiq/relwolf
```

Or copy the folder [`skills/relwolf-setup`](https://github.com/lupiq/relwolf/tree/main/skills/relwolf-setup) to the
skills folder of your agent:

| Agent          | Folder                         |
| -------------- | ------------------------------ |
| GitHub Copilot | `.github/skills/relwolf-setup` |
| Claude Code    | `.claude/skills/relwolf-setup` |
| Others         | `.agents/skills/relwolf-setup` |

Then start your agent in the repository and ask it to set up relwolf, or use the skill directly, for example
`/relwolf-setup`.

## No installation: prompt

If you do not want to install a skill, give your agent this prompt. It loads the skill from GitHub for this one session:

```text
Set up relwolf in this repository. Read the skill at
https://raw.githubusercontent.com/lupiq/relwolf/main/skills/relwolf-setup/SKILL.md
and the files it links to in the references folder next to it, and follow it step by step.
```

## What to expect

- The agent only reads your repository until you confirmed the summary.
- You answer a handful of questions with a recommended default each; skip anything you do not need.
- Afterwards you review the changes with `git diff`, commit them yourself and complete the manual steps (create the
  `RELWOLF_TOKEN`, set squash merging).

::: tip Check the result
AI agents make mistakes. Review the generated `relwolf.yaml` against the
[configuration reference](/configuration/relwolf-yaml) and the CI job against the [GitHub](/guide/github) or
[GitLab](/guide/gitlab) guide. The first release request shows what relwolf will do before anything is released.
:::

Prefer to do it by hand? Follow [Getting started](/guide/getting-started).
