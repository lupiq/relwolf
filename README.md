<p align="center">
  <img src="docs/public/logo.svg" alt="relwolf" width="140" />
</p>

# relwolf

A release bot for **GitLab** and **GitHub** that follows the workflow of Google's
[release-please](https://github.com/googleapis/release-please): it determines the next
[SemVer](https://semver.org/) version from [Conventional Commits](https://www.conventionalcommits.org/), opens a
release merge request with the changelog and updated version files, and tags and releases once it is merged.

📖 **Documentation: [relwolf.lupiq.io](https://relwolf.lupiq.io)**

relwolf is developed by [lupiq](https://lupiq.com).

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
