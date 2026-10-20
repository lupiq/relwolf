<p align="center">
  <img src="docs/public/logo.svg" alt="relwolf" width="140" />
</p>

# relwolf

[![CI](https://github.com/lupiq/relwolf/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/lupiq/relwolf/actions/workflows/ci.yml)
[![E2E (GitLab)](https://github.com/lupiq/relwolf/actions/workflows/e2e.yml/badge.svg?branch=main)](https://github.com/lupiq/relwolf/actions/workflows/e2e.yml)
[![Coverage](https://codecov.io/gh/lupiq/relwolf/graph/badge.svg)](https://codecov.io/gh/lupiq/relwolf)
[![Latest release](https://img.shields.io/github/v/release/lupiq/relwolf)](https://github.com/lupiq/relwolf/releases/latest)
[![License: MIT](https://img.shields.io/github/license/lupiq/relwolf)](LICENSE)
[![Docker image](https://img.shields.io/badge/ghcr.io-lupiq%2Frelwolf-2496ed?logo=docker&logoColor=white)](https://github.com/lupiq/relwolf/pkgs/container/relwolf)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-relwolf%20Release%20Bot-2088ff?logo=github)](https://github.com/marketplace/actions/relwolf-release-bot)
[![Documentation](https://img.shields.io/badge/docs-relwolf.lupiq.io-2bb3a3)](https://relwolf.lupiq.io)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A5%2024-5fa04e?logo=nodedotjs&logoColor=white)](package.json)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/)
[![Renovate](https://img.shields.io/badge/renovate-enabled-1a1f6c?logo=renovate&logoColor=white)](https://docs.renovatebot.com/)

A release bot for **GitLab** and **GitHub** that follows the workflow of Google's
[release-please](https://github.com/googleapis/release-please): it determines the next
[SemVer](https://semver.org/) version from [Conventional Commits](https://www.conventionalcommits.org/), opens a
release merge request with the changelog and updated version files, and tags and releases once it is merged.

📖 **Documentation: [relwolf.lupiq.io](https://relwolf.lupiq.io)**

relwolf is developed by [lupiq](https://lupiq.com) and released under the [MIT License](LICENSE).

## Quick start (GitHub Actions)

1. Store a personal access token (_contents_ and _pull requests_ write access) as the repository secret
   `RELWOLF_TOKEN`.
2. Repository settings: allow **squash merging** only and enable _Automatically delete head branches_.
3. Add a workflow:

   ```yaml
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

Using GitLab? See the [GitLab guide](https://relwolf.lupiq.io/guide/gitlab). For configuration (`relwolf.yaml`),
monorepos, updaters, pre-releases, forcing a version and everything else, see the
[documentation](https://relwolf.lupiq.io).

## Development

```sh
pnpm install
pnpm typecheck
pnpm lint           # ESLint + typescript-eslint (strict, type-checked)
pnpm format:check   # Prettier (use `pnpm format` to fix)
pnpm test           # unit + integration tests (real git repositories and git-cliff)
pnpm build
pnpm docs:dev       # documentation site (VitePress, sources in docs/)
```

Git hooks (Husky, installed by `pnpm install`): `pre-commit` runs lint-staged (Prettier on staged files) and
`pnpm lint`; `commit-msg` runs commitlint (Conventional Commits, subject must start with a capital letter).

Design decisions, architecture and extension notes are documented in [AGENTS.md](AGENTS.md). Maintainer setup
(release token, Pages, Renovate) is described in the
[documentation](https://relwolf.lupiq.io/development/releasing).
