# relwolf – project context for contributors and AI agents

Everything needed to extend relwolf in a new session: requirements, decisions, architecture, conventions.
User-facing documentation lives in the VitePress site in `docs/` (published at https://relwolf.lupiq.io); the
`README.md` only holds repo-relevant info and the GitHub Action quick start. Keep docs and this file in sync.

## Goal

Release bot modelled on Google's release-please, for **GitLab** (gitlab.com and self-managed), provider-agnostic
so GitHub works too. Runs once per CI job (push to the default branch), no daemon. Shipped as Docker image
`ghcr.io/lupiq/relwolf` so it can be used as the `image:` of a GitLab CI job. relwolf releases itself via the
GitHub provider.

Flow: Conventional Commits → next SemVer → release MR (changelog + version files) on branch `relwolf/<branch>`
→ on merge: tag `vX.Y.Z` + release with the changelog entry.

## Agreed requirements and decisions

- Language: TypeScript, everything (code, docs, commits, changelog) in **English**. Node LTS (24), **pnpm**, **Vitest**.
- Single command with automatic detection of what to do (no subcommands). Config via file `relwolf.yaml` only
  (no CLI flags). Secrets/CI context via env vars (see README).
- Tag format `v1.2.3`; monorepo packages use `<component>-v1.2.3`. Standard SemVer; `feat`=minor, `fix`=patch,
  `!`/`BREAKING CHANGE`=major, nothing else bumps. `bump-minor-pre-major` default true. First release without tag is
  computed from `0.0.0` (feat→0.1.0, fix→0.0.1) unless `initial-version` is set. Configurable pre-releases
  (`prerelease: beta` → `1.3.0-beta.1`).
- Changelog is produced by **git-cliff** (npm package, bundled); users control the format with their own `cliff.toml`.
  Which commit types appear is purely git-cliff configuration. relwolf's own `cliff.toml` lists all types except `chore`.
- Updaters: `package-json`, `pom-xml`, `gradle`, `generic` (line markers `x-relwolf-version`, `x-relwolf-minor`, `x-relwolf-major`; the partial ones leave
  pre-releases unchanged). The README and the docs pages with `@v1`/`:1` examples are kept current this way (`generic` updaters in `relwolf.yaml`; each file with a marker must be listed there). The docs build strips `# x-relwolf-*` comments from code fences (`markdown.config` in `config.mts`, except on `configuration/updaters.md`), so copied snippets stay clean.
- GitLab project settings assumed: squash + fast-forward-only, no merge commits. MRs are labelled
  `relwolf: pending` / `relwolf: tagged`; source branch of the release MR `relwolf/<branch>`.
- The CI job provides a full git clone (`GIT_DEPTH: 0`); relwolf aborts with a clear error on shallow clones.
  Git is used read-only; all writes (branch commit, MR, labels, tags, releases) go through the provider API.
- Provider layer is replaceable (`src/providers/types.ts`); GitLab and GitHub are implemented.
- Docker tags: `latest`, `X.Y.Z`, `X.Y`, `X`, `sha`; platforms amd64+arm64; public image. No `ENTRYPOINT`
  (GitLab overrides it), `relwolf` is on the `PATH`.
- License: MIT (`LICENSE`, `license` in `package.json`), copyright holder "lupiq".
- Rule from the user: **do not make assumptions on open design questions – ask.**

## Architecture (`src/`)

| File                               | Responsibility                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli.ts`                           | Entry point: load config, build provider from env, call `run`                                                                                                                                                                   |
| `config.ts`                        | `relwolf.yaml` schema (zod, strict; incl. `pull-request-title` template), path normalisation/validation, `Config`/`PackageConfig`                                                                                               |
| `release.ts`                       | Orchestration: `run()` → skip guards, shallow check, `tagMergedReleases`, `prepareReleaseRequest`                                                                                                                               |
| `plan.ts`                          | Per-package plan: last tags, commits since, next version, changelog range                                                                                                                                                       |
| `version.ts`                       | SemVer parse/compare/bump, `nextVersion` incl. pre-release logic                                                                                                                                                                |
| `commits.ts`                       | Conventional commit parsing and bump level                                                                                                                                                                                      |
| `tags.ts`                          | Tag naming, discovery, tag regex for git-cliff, validation of untrusted tags                                                                                                                                                    |
| `changelog.ts`                     | git-cliff invocation (`generateNotes`, `prependToChangelog` via temp file)                                                                                                                                                      |
| `body.ts`                          | MR title/body rendering and parsing (hidden `relwolf:notes` markers, sanitised)                                                                                                                                                 |
| `git.ts`                           | Thin git wrapper (`execFile`), `run()` helper for subprocesses                                                                                                                                                                  |
| `updaters/*`                       | Pure `(content, version, file) => content` functions + registry in `index.ts`                                                                                                                                                   |
| `providers/types.ts`               | `Provider` interface – the only place providers must satisfy                                                                                                                                                                    |
| `providers/gitlab.ts`, `github.ts` | REST implementations; `http.ts` shared fetch client (retries 429/403+Retry-After for all methods, 502-504 and network errors for idempotent ones only; `requestAll` follows pagination, max 10 pages); `index.ts` env detection |

Key mechanics worth knowing:

- `RELWOLF_RELEASE_AS` (`release-as.ts`): forces the next version per component. `prepareReleaseRequest` reads the
  open MR first, merges stored `relwolf:release-as` markers with the env request (env wins, `auto` deletes) and
  re-persists them in the body until merge. `planPackage` validates it is greater than the last tag.

- The release MR body is the state store: it carries the release notes between `relwolf:notes` markers and the
  base commit sha. An identical title+body means "up to date" (no recommit). Merged MRs are found via the
  `relwolf: pending` label, the tag goes on `mergeSha` (merge → squash → head sha) if it is an ancestor of HEAD,
  otherwise the MR is skipped until a later run.
- Bump level is computed from commits since the **last stable** tag; the changelog range starts at the last tag
  (any) in pre-release mode, at the last stable tag otherwise. `--tag-pattern` keeps other components' tags and
  (for stable) pre-release tags from splitting the output. Without a range git-cliff needs `--unreleased`.
- The release commit is created with `start_sha`/`force` (GitLab) or the git data API (GitHub) on top of HEAD;
  files are computed in memory, the working tree is never modified.
- Tags created through the API are also created locally so the same run sees them.
- Tag/commit text from MR bodies is untrusted: tags are validated (`isValidReleaseTag`), `<!--` is escaped in notes.
- GitLab has no pre-release flag for releases; the hint is only used by GitHub.

## Testing

`pnpm test` (Vitest, ~20 s). Unit tests per module plus `test/release.test.ts`, an integration suite using real
temporary git repos, the real git-cliff and the in-memory `FakeProvider` from `test/helpers.ts`
(`mergeLastRelease` simulates merging the release MR). Provider tests mock `fetch`. When changing behaviour add a
test in the matching file; `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build` must stay clean. Lint: `eslint.config.ts`
(typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`; `no-unsafe-*` relaxed for `src/providers` (untyped
REST JSON) and several rules for `test/`). typescript-eslint does not support TS 7 yet, so `typescript` is aliased to
`@typescript/typescript6` and TS 7 is installed as `@typescript/native` (provides `tsc`); drop the alias once
typescript-eslint supports TS ≥ 7.1. ESLint loads the TS config via `--flag unstable_native_nodejs_ts_config`. Coverage: `pnpm test:coverage`.

`pnpm test:e2e` (`vitest.e2e.config.ts`, folder `e2e/`) runs the real release flow against the sandbox project
`lupiq/relwolf-e2e-tests` on gitlab.com: `GitLabSandbox` (`e2e/gitlab-sandbox.ts`) creates a branch `e2e-<id>` per
scenario, commits through the API, runs `run()` on a fresh clone, merges the release MR and removes tags, releases
and `e2e-*` branches afterwards. Scenarios: MR create/update, tag + release, monorepo, pre-release, revert closes
the MR. Needs `GITLAB_E2E_TOKEN` (service account, Developer, scope `api`) and `GITLAB_E2E_PROJECT_ID` (locally in
the git-ignored `.env.e2e`; optional `GITLAB_E2E_API_URL`). `E2E_KEEP=1` skips the cleanup, `E2E_DEBUG=1` logs every
request. Not part of `pnpm test`; CI: `.github/workflows/e2e.yml` (manual and on every push to `main`). The sandbox
`main` needs one initial commit made by a human (Developers cannot push to the empty protected branch).

Git hooks (Husky, `.husky/`, set up by the `prepare` script): `pre-commit` = lint-staged (`.lintstagedrc.json`,
Prettier on staged files) + `pnpm lint`; `commit-msg` = commitlint (`commitlint.config.ts`: config-conventional plus
sentence-case subject, i.e. the text after `type:` starts with a capital letter). Note: `pnpm add` ignores
`save-exact` here, so pin versions in `package.json` manually (no `^`/`~`).

## Packaging and CI

- `Dockerfile`: multi-stage (build, prod deps, final `node:24-slim` + git, `safe.directory '*'`). The image could not
  be built in the authoring session (registry unreachable) – verify with `docker build .` after changes.
- `.github/workflows/ci.yml` (format check, lint, typecheck, tests, build, image smoke test), `release.yml` (relwolf releases itself from
  source on pushes to `main`, needs secret `RELWOLF_TOKEN` = PAT so the tag triggers the next workflow),
  `publish.yml` (tag `v*` → multi-arch image to `ghcr.io/lupiq/relwolf`).
- `relwolf.yaml` in the repo root is relwolf's own config. Package version in `package.json` stays `0.0.0` until the
  first release; never bump it manually.
- Dependency updates: Renovate (`renovate.json`). Commits are `fix(deps): Update …` for runtime `dependencies` (so they
  trigger a patch release) and `build(deps): Update …` for everything else (devDependencies, actions, Docker, which
  never bump); minor/patch/pin/digest are auto-merged by Renovate itself (squash) once the CI
  checks are green, majors need a manual merge. Related packages are grouped into one PR (typescript = TS 6 alias +
  `@typescript/native`, eslint, vitest, commitlint, prettier, pnpm incl. the Dockerfile version) so version conflicts
  between them cannot occur. Runs at any time.
- GitHub Action: `action.yml` (Docker container action, `entrypoint: relwolf`, input `token` → `RELWOLF_TOKEN`) uses
  `docker://ghcr.io/lupiq/relwolf:<version>`. The version line carries the `x-relwolf-version` marker and is bumped
  by relwolf's own `generic` updater (see `relwolf.yaml`), so a tag always references the image built from it.
  `publish.yml` (tags `v*.*.*`) moves the floating major tag (`v1`) after the image push, stable releases only.
  Renovate ignores `action.yml`. The action was not run end-to-end in the authoring session.
- Documentation: VitePress (`docs/`, config `docs/.vitepress/config.mts`, theme tweaks in `docs/.vitepress/theme`).
  Scripts `pnpm docs:dev|docs:build|docs:preview`; excluded from ESLint, formatted by Prettier, built in `ci.yml`.
  `docs.yml` deploys to GitHub Pages on stable `v*.*.*` tags (and manually); custom domain via `docs/public/CNAME`
  (`relwolf.lupiq.io`). Assets in `docs/public`: relwolf logo (`logo.svg`, ~2 KB hand-simplified vector trace of the
  hand-made raster app icon; used for navbar, hero, README; `favicon.svg` is a simplified logo (head, eye, two facets) for small sizes, `favicon.png` is rendered from it, `apple-touch-icon.png` from the full logo; `og-image.png` is the 1200x630 social preview). SEO: every page needs frontmatter `title` and `description`; canonical URL, Open Graph/Twitter tags and JSON-LD are generated in `config.mts`, plus `sitemap.xml` and `robots.txt`, bot avatar (`relwolf-avatar.png`, 512 px, 256 colours to stay below GitLab's 200 KB limit) and the lupiq logos (colour for light, white for
  dark theme, switched via CSS classes `only-light`/`only-dark`). lupiq.com is not live yet.
  Brand colours are teal `#2bb3a3` and violet `#3a2e5e`: the site defines them once as CSS variables
  (`--lupiq-*` in `theme/custom.css`).
- Manual setup still required: Pages source set to "GitHub Actions" + custom domain `relwolf.lupiq.io` (DNS CNAME to
  `lupiq.github.io`), `RELWOLF_TOKEN` secret, GHCR package set to public, auto-delete head branches,
  install the Renovate GitHub App (https://github.com/apps/renovate) for the repository, allow squash merging.

## Ideas / not implemented

- Extra updaters (pyproject.toml, Cargo.toml, …), `extra-files` style globs, lockfile updates.
- Configurable patch-bump types (decision so far: only `fix`), custom labels/branch names, MR title template.
- Draft/pre-release handling for GitLab, signing.
- Providers for other platforms: implement `Provider` and extend `providers/index.ts`.
