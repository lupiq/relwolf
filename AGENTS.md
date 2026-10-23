# relwolf – notes for contributors and AI agents

Only things that are not enforced by ESLint, Prettier, commitlint or the type checker. User documentation lives in
`docs/` (VitePress) and `README.md`; keep them in sync with behaviour changes.

## Rules

- **Do not make assumptions on open design questions – ask.**
- Do not commit; the maintainer commits himself.
- Everything (code, docs, commits, changelog) is in English.
- Pin dependency versions in `package.json` manually (no `^`/`~`; `pnpm add` ignores `save-exact`).
- Never bump the version in `package.json` or `src/app-version.ts` manually; relwolf's own release does it
  (`relwolf.yaml`). Every file containing an `x-relwolf-*` marker must be listed there as a `generic` updater.
- Behaviour changes need a test in the matching file under `test/`; `pnpm typecheck`, `pnpm lint`,
  `pnpm format:check`, `pnpm test` and `pnpm build` must stay clean (`pnpm docs:build` for docs changes).
- The Dockerfile cannot be verified by the test suite; check `docker build .` after changes.

## Design decisions

- Single command, no subcommands or CLI flags; configuration only via `relwolf.yaml` (strict schema), secrets and CI
  context via env vars.
- Git is used read-only; all writes (release commit, MR, labels, tags, releases) go through the `Provider` interface
  (`src/providers/types.ts`). The working tree is never modified; files are computed in memory.
- Requires a full clone; shallow clones abort with an error.
- The release MR body is the state store (notes, base sha, release-as, editable title/text between hidden
  `relwolf:*` markers). Identical title and body means "up to date".
- Merged MRs are found via the `relwolf: pending` label; the tag goes on the merge sha if it is an ancestor of HEAD,
  otherwise the MR is skipped until a later run.
- The bump level comes from commits since the last **stable** tag; the changelog range starts at the last tag in
  pre-release mode, otherwise at the last stable tag.
- Tag and commit text from MR bodies is untrusted: tags go through `isValidReleaseTag`, `<!--` is escaped in notes.
- Changelog format is purely git-cliff configuration (`cliff.toml`).
- Updaters are pure `(content, version, file, key) => content` functions without dependencies that keep formatting;
  lockfiles come via `companions()` in `src/updaters/index.ts`.
- The job log should explain decisions (`plan.ts`), and HTTP errors carry provider-specific hints.
- Docker image: no `ENTRYPOINT` (GitLab overrides it), `relwolf` on the `PATH`, amd64 + arm64.

## Tooling quirks

- typescript-eslint does not support TS 7 yet: `typescript` is aliased to `@typescript/typescript6` and TS 7 is
  installed as `@typescript/native`. Drop the alias once typescript-eslint supports TS ≥ 7.1.
- `pnpm test:e2e` runs against a sandbox project on gitlab.com and needs `GITLAB_E2E_TOKEN` and
  `GITLAB_E2E_PROJECT_ID` (see `e2e/`); it is not part of `pnpm test`.
- Renovate (`renovate.json`) uses `build(deps)` commits for everything; related packages are grouped.

## Manual setup that cannot be committed

Pages source "GitHub Actions" + custom domain, secrets `RELWOLF_TOKEN` and `GITLAB_E2E_TOKEN`, public GHCR package,
auto-delete head branches, Renovate GitHub App, squash merging.
