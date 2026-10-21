---
title: Contributing
description: How to set up the relwolf repository, run tests and linters, and contribute to the release bot for GitLab and GitHub.
---

# Contributing

```sh
pnpm install
pnpm typecheck
pnpm lint           # ESLint + typescript-eslint (strict, type-checked)
pnpm format:check   # Prettier (use `pnpm format` to fix)
pnpm test           # unit + integration tests (real git repositories and git-cliff)
pnpm build
pnpm docs:dev       # this documentation, with live reload
pnpm docs:build
```

Git hooks (Husky, installed by `pnpm install`): `pre-commit` runs lint-staged (Prettier on staged files) and
`pnpm lint`; `commit-msg` runs commitlint (Conventional Commits, subject must start with a capital letter).

See also [CONTRIBUTING.md](https://github.com/lupiq/relwolf/blob/main/CONTRIBUTING.md) and the
[security policy](https://github.com/lupiq/relwolf/blob/main/SECURITY.md).

Design decisions, architecture and extension notes are documented in
[AGENTS.md](https://github.com/lupiq/relwolf/blob/main/AGENTS.md).

## Dependency updates

[Renovate](https://docs.renovatebot.com/) (`renovate.json`) keeps dependencies, GitHub Actions and the Docker base image
up to date. Install the [Renovate GitHub App](https://github.com/apps/renovate) for the repository and allow squash
merging. Updates use the commit type `build`, which relwolf is configured to release as a patch
(`patch-types: [fix, build]`). Minor and patch updates are merged automatically once CI is green; major updates need a manual merge. Related
packages (TypeScript, ESLint, Vitest, commitlint, Prettier, pnpm) are updated together.
