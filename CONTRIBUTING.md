# Contributing

Thanks for your interest in relwolf! Bug reports, ideas and pull requests are welcome.

## Setup

Requirements: Node.js 24 and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm test
```

## Checks

These must pass before a pull request is merged (CI runs them as well):

| Command             | Purpose                        |
| ------------------- | ------------------------------ |
| `pnpm lint`         | ESLint                         |
| `pnpm format:check` | Prettier (`pnpm format` fixes) |
| `pnpm typecheck`    | TypeScript                     |
| `pnpm test`         | Unit and integration tests     |
| `pnpm build`        | Compile to `dist/`             |
| `pnpm docs:build`   | Build the documentation site   |

`pnpm test:coverage` creates a coverage report. `pnpm test:e2e` runs the GitLab end-to-end tests and needs a
`GITLAB_E2E_TOKEN`; it is optional for contributors.

When you change behaviour, add or adjust a test in the matching file under `test/`. When you add or change a
configuration option, update `docs/` and `AGENTS.md` as well.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (checked by commitlint). The
subject starts with a capital letter, e.g. `feat: Add dry-run mode`. relwolf releases itself from these messages:

| Type                    | Release |
| ----------------------- | ------- |
| `feat`                  | minor   |
| `fix`, `build`          | patch   |
| `!` / `BREAKING CHANGE` | major   |

Other types (`docs`, `test`, `chore`, `ci`, `refactor`, …) do not trigger a release.

Pull requests are squash-merged, so the pull request title must be a valid Conventional Commit as well.

## Code style

- TypeScript, everything (code, docs, commits) in English.
- Curly braces on every `if`, a blank line before `return` and between statements. ESLint and Prettier enforce this.
- Only comment code that needs clarification.

See [AGENTS.md](AGENTS.md) for the architecture and the design decisions.

## Security

Please report vulnerabilities privately, see [SECURITY.md](SECURITY.md).
