# relwolf 🐺

A release bot for **GitLab** (and GitHub) that follows the workflow of Google's
[release-please](https://github.com/googleapis/release-please):

1. On every push to the release branch, relwolf reads the
   [Conventional Commits](https://www.conventionalcommits.org/) since the last release and
   determines the next [SemVer](https://semver.org/) version.
2. It opens (or updates) a **release merge request** on the branch `relwolf/<branch>` that contains the
   updated changelog and the new version in your project files.
3. When that merge request is merged, relwolf **tags** the merge commit (`v1.2.3`) and creates a
   **release** whose description is the changelog entry.

relwolf runs once per job (no daemon, no webhooks) and is shipped as a Docker image, so it can be
used directly as the `image:` of a GitLab CI job.

## Quick start (GitLab)

1. Create a **personal / project access token** with the `api` scope and role Developer or higher
   (it must be able to push the branch `relwolf/main`, create merge requests, tags and releases) and store it
   as a masked CI/CD variable, e.g. `RELWOLF_TOKEN`.
2. Project settings: merge method **Fast-forward merge** with **Squash** enabled (merge commits are not
   needed), and _Delete source branch_ as default is recommended.
3. Add a job to `.gitlab-ci.yml`:

   ```yaml
   relwolf:
     image: ghcr.io/lupiq/relwolf:latest # pin a version, e.g. :1
     stage: release
     resource_group: relwolf
     variables:
       GIT_DEPTH: 0 # relwolf needs the full history and all tags
     rules:
       - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
     script:
       - relwolf
   ```

4. Optionally add a [`relwolf.yaml`](#configuration) to the repository root.

The image has no `ENTRYPOINT`, so `relwolf` is simply a command on the `PATH`.

## How it works

Each run executes two phases:

1. **Tag merged releases.** Merge requests labelled `relwolf: pending` that were merged into the release
   branch get their tag created on the merge commit and a release published (the notes are taken from the
   merge request description, so you can edit them before merging). Afterwards the label is switched to
   `relwolf: tagged`. Every step is idempotent, so a failed job can simply be re-run.
2. **Prepare the next release.** For every configured package, the commits since the last release tag are
   analysed. If something releasable happened, relwolf
   - generates the new changelog entry with [git-cliff](https://git-cliff.org/),
   - updates the version in the configured files,
   - force-pushes a single commit to `relwolf/<branch>` through the API (the working tree is never modified),
   - creates or updates the merge request `chore(release): prepare for v1.2.3` labelled `relwolf: pending`.

Pipelines that are not branch pipelines for the release branch (merge request pipelines, tag pipelines,
other branches) are skipped without an error.

### Version rules

| Commit                                   | Bump  |
| ---------------------------------------- | ----- |
| `feat!:`, `fix(x)!:`, `BREAKING CHANGE:` | major |
| `feat:`                                  | minor |
| `fix:`                                   | patch |
| everything else                          | none  |

- Before `1.0.0` a breaking change only bumps the minor version (`bump-minor-pre-major`, default `true`).
- Without any tag the first release is calculated from `0.0.0` (`feat` → `0.1.0`, `fix` → `0.0.1`), unless
  `initial-version` is set.
- Tags are `v1.2.3`; packages with a `component` use `<component>-v1.2.3`.
- Only commits touching a package's path count for that package.

### Pre-releases

Set `prerelease: beta` to publish `1.3.0-beta.1`, `1.3.0-beta.2`, ... A new pre-release is only proposed
when a releasable commit happened since the previous one. Removing the option graduates to the stable
version (`1.3.0`) with the changelog covering everything since the last stable release.

## Configuration

`relwolf.yaml` in the repository root (optional; defaults to a single root package without file updaters):

```yaml
branch: main # release branch; defaults to the CI default branch, then "main"
cliff-config: cliff.toml # git-cliff config; defaults to git-cliff's own discovery/default
prerelease: beta # optional, default for all packages
bump-minor-pre-major: true # optional, default for all packages

packages:
  '.':
    component: app # optional for one package; required for every other package (used as tag prefix)
    changelog-path: CHANGELOG.md # relative to the package path
    initial-version: 1.0.0 # optional, first stable version if no tag exists
    prerelease: rc # optional, overrides the global value
    bump-minor-pre-major: false # optional, overrides the global value
    updaters:
      - type: package-json # default path: package.json
      - type: pom-xml # default path: pom.xml
      - type: gradle # default path: build.gradle (also: build.gradle.kts, gradle.properties)
      - type: generic
        path: deploy/values.yaml
```

Paths of updaters and the changelog are relative to the package path. Unknown keys are rejected.

### Monorepos

```yaml
packages:
  '.':
    updaters: [{type: package-json}]
  services/api:
    component: api # tags: api-v1.2.3
    updaters:
      - type: pom-xml
```

Packages are versioned independently and listed together in one release merge request. A package at `.`
ignores changes inside other configured packages.

### Updaters

| Type           | What it changes                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `package-json` | the top-level `"version"`                                                                       |
| `pom-xml`      | the project's own `<version>` (not the parent's or any dependency's)                            |
| `gradle`       | a top-level `version = '…'` / `version "…"` (Groovy/Kotlin DSL) or `version=…` in `.properties` |
| `generic`      | the first semantic version on every line containing the marker `x-relwolf-version`              |

```yaml
image:
  tag: 1.2.3 # x-relwolf-version
```

### Changelog (git-cliff)

relwolf delegates all changelog formatting to git-cliff (bundled via npm). Put a `cliff.toml` into your
repository (relwolf passes it with `--config` when you set `cliff-config`, and git-cliff finds `cliff.toml`
in the repository root on its own) to control groups, templates, header and footer. relwolf adds
`--tag`, `--tag-pattern`, `--include-path`/`--exclude-path` and the commit range, and prepends the entry to
the changelog file. Release merge requests are titled `chore(release): prepare for …`, which the default
git-cliff configuration skips.

## Environment variables

| Variable                                                                    | Purpose                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `RELWOLF_TOKEN`                                                             | **Required.** Access token used for all API calls                       |
| `RELWOLF_PROVIDER`                                                          | `gitlab` or `github`; auto-detected from `GITLAB_CI` / `GITHUB_ACTIONS` |
| `RELWOLF_GIT_CLIFF`                                                         | Path to a git-cliff executable instead of the bundled one               |
| `CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_COMMIT_BRANCH`, `CI_DEFAULT_BRANCH`   | GitLab CI (set by GitLab, works for gitlab.com and self-managed)        |
| `GITHUB_API_URL`, `GITHUB_REPOSITORY`, `GITHUB_REF_TYPE`, `GITHUB_REF_NAME` | GitHub Actions (set by GitHub)                                          |

## Providers

The hosting platform is an interface (`src/providers/types.ts`) with two implementations: **GitLab** and
**GitHub**. relwolf releases itself with the GitHub provider (`.github/workflows/release.yml`).
GitLab releases have no pre-release flag, so the `prerelease` hint is only used on GitHub.

## Docker image

`ghcr.io/lupiq/relwolf` (linux/amd64, linux/arm64), built by GitHub Actions on every release tag:
`latest`, `X.Y.Z`, `X.Y`, `X` and `sha-<commit>`. The image contains Node.js, git and relwolf with git-cliff.

## Development

```sh
pnpm install
pnpm typecheck
pnpm lint           # ESLint + typescript-eslint (strict, type-checked)
pnpm format:check   # Prettier (use `pnpm format` to fix)
pnpm test            # unit + integration tests (real git repositories and git-cliff)
pnpm build
```

Git hooks (Husky, installed by `pnpm install`): `pre-commit` runs lint-staged (Prettier on staged files) and
`pnpm lint`; `commit-msg` runs commitlint (Conventional Commits, subject must start with a capital letter).

Design decisions, architecture and extension notes are documented in [AGENTS.md](AGENTS.md).

### Releasing relwolf itself

Add a `RELWOLF_TOKEN` secret (a personal access token with _contents_ and _pull requests_ write access,
not `GITHUB_TOKEN`, so that tag pushes trigger the image workflow) and enable
_Automatically delete head branches_ in the repository settings.
