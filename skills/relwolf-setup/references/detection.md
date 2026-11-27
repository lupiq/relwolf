# Detecting the repository

Use read-only commands and file reads only.

## Platform and branch

- `git remote get-url origin`: `github.com` or a GitHub Enterprise host means GitHub; `gitlab.com` or a self-managed
  GitLab host means GitLab. If unclear, check for `.github/` vs. `.gitlab-ci.yml`, and ask.
- Default branch: `git symbolic-ref --short refs/remotes/origin/HEAD`, else `main`/`master`. Set `branch` in
  `relwolf.yaml` only if it is not the CI default branch.

## History

- `git rev-parse --is-shallow-repository` must be `false` (relwolf aborts on shallow clones; the CI job fetches the
  full history anyway).
- `git tag --list --sort=-v:refname | head`: existing tags show the tag format (`v1.2.3` or `<component>-v1.2.3`).
  Mirror it with `tag-template` if it differs from the default. Without tags, ask for `initial-version` or
  `bootstrap-sha`.
- `git log --format=%s -n 50`: share of Conventional Commits. If it is low, tell the user and recommend commit linting
  or `strategy: changesets`.
- Merge commits (`git log --merges -n 5`) mean squash merging is not used yet; relwolf assumes there are none.

## Existing tooling

| Found                                                         | Action                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `release-please-config.json`, `.release-please-manifest.json` | Map packages and components to `packages`; ask whether to remove it and its workflow       |
| `.releaserc*`, `semantic-release` in `package.json`           | Ask whether to remove it; mention that relwolf opens a release request first               |
| `.changeset/config.json`                                      | Recommend `strategy: changesets`                                                           |
| `standard-version`, existing `CHANGELOG.md`                   | The changelog is kept; for a one-time rewrite see https://relwolf.lupiq.io/guide/migrating |
| `cliff.toml`                                                  | Use it as `cliff-config`                                                                   |
| `commitlint.config.*`, `.commitlintrc*`, `.husky/`, lefthook  | Existing commit linting, do not duplicate it                                               |
| `.github/workflows/*`, `.gitlab-ci.yml`                       | Where to merge the relwolf job; reuse stage names, runners and the checkout action version |
| Formatter (`prettier`, `spotless`, ...)                       | Candidate for `pre-commit-script`, so the generated changelog passes the formatting check  |

## Single vs. monorepo

A project is a monorepo if there is more than one releasable unit. Look for:

- JavaScript: `workspaces` in `package.json`, `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`. List the
  member `package.json` files; skip `private: true` packages unless the user wants to release them.
- Maven: `<modules>` in `pom.xml`. Gradle: `include` in `settings.gradle(.kts)`.
- Rust: `[workspace]` in `Cargo.toml`. Python: multiple `pyproject.toml`. .NET: multiple `*.csproj`.
- Helm: multiple `Chart.yaml`. Services in `services/*`, `apps/*`, `packages/*` with their own manifests.

Ask whether each candidate should be released on its own. Modules that always share one version are a
`linked-versions` candidate (for example a Gradle multi-module build).

## Mapping files to updaters

| File                                      | Updater                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| `package.json`                            | `package-json` (lockfiles are updated by default)    |
| `pom.xml`                                 | `pom-xml`                                            |
| `build.gradle(.kts)`, `gradle.properties` | `gradle`                                             |
| `pyproject.toml`                          | `pyproject`                                          |
| `Cargo.toml`                              | `cargo`                                              |
| `*.csproj`, `Directory.Build.props`       | `dotnet`                                             |
| `Chart.yaml`                              | `helm`                                               |
| other JSON/YAML/TOML with a version key   | `json` / `yaml` / `toml` with `path` and `key`       |
| any text with a version                   | `generic` plus an `x-relwolf-version` marker comment |

Only offer updaters for files that exist. For default paths, `key`, `lockfiles` and markers read
https://relwolf.lupiq.io/configuration/updaters. Paths of package updaters are relative to the package path;
components must be unique (only one package may omit `component`).
