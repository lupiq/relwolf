# Options and questions

Ask only what applies. Preselect the recommended answer. Everything not asked keeps relwolf's default and must not
be written to `relwolf.yaml` (keep the file minimal). Full reference: https://relwolf.lupiq.io/configuration/relwolf-yaml

Start the file with `# yaml-language-server: $schema=https://relwolf.lupiq.io/schema.json`.

## 1. Strategy

| Answer                         | Result                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conventional Commits (default) | nothing to write                                                                                                                                                                                       |
| Changesets                     | `strategy: changesets`. Needs `.changeset/config.json` (`npx @changesets/cli init`) and a JS workspace; no commit lint, no `cliff.toml`, no `patch-types`/`minor-types`. See /configuration/changesets |

## 2. Packages and monorepo mode

Single project: no `packages` needed unless it has updaters (use `packages: {'.': {updaters: [...]}}`).

Monorepo - one `packages` entry per released path. Exactly one package may omit `component`; all others need a unique
`component` (the tag prefix). `root` is a reserved name.

| Goal                                    | Options                                        |
| --------------------------------------- | ---------------------------------------------- |
| Independent versions, one request       | default                                        |
| Independent versions, one request each  | `separate-pull-requests: true`                 |
| One shared version, one tag per package | `linked-versions: true` (or groups of paths)   |
| One shared version, one tag and release | `linked-versions: true`, `linked-tags: single` |

Other questions: `tag-template` (match existing tags), `changelog-links` and `changelog-links-text` (root changelog links to the
changelogs of the other packages), `exclude-paths` (globs that never count, e.g. `docs/**`). See /configuration/monorepos.

## 3. Updaters

Per package `updaters: [{type: ..., path?, key?, lockfiles?}]`, paths relative to the package. Types:
`package-json`, `pom-xml`, `gradle`, `pyproject`, `cargo`, `dotnet`, `helm`, `json`, `yaml`, `toml`, `generic`.
`json`, `yaml`, `toml` and `generic` require `path`; `json`, `yaml`, `toml` take a dotted `key`. `generic` replaces the
version at a marker comment such as `# x-relwolf-version`. Files shared by several components (README, docs) go into
the top-level `updaters` (type `generic`, path relative to the repository root) with `x-relwolf-version:<component>`
markers. When adding a marker to a file (README, workflow, Dockerfile), add the marker comment in that file too.
See /configuration/updaters.

## 4. Versioning

| Question                                | Key                              | Default               |
| --------------------------------------- | -------------------------------- | --------------------- |
| First version if no stable tag exists   | `initial-version` (per package)  | computed from `0.0.0` |
| Ignore history before a commit          | `bootstrap-sha`                  | none                  |
| Pre-release channel (`1.3.0-beta.1`)    | `prerelease` (global or package) | none                  |
| Breaking changes bump minor while 0.x   | `bump-minor-pre-major`           | `false`               |
| Commit types that release a patch/minor | `patch-types`, `minor-types`     | `[fix]`, `[feat]`     |
| Branch to release from                  | `branch`                         | CI default branch     |

`patch-types: [fix, build, docs]` is common when dependency updates (`build(deps)`) should release. See /guide/version-rules
and /guide/pre-releases.

## 5. Changelog

`changelog-path` (default `CHANGELOG.md`), `changelog-title`, `cliff-config` (path to a git-cliff `cliff.toml`; offer
to generate one only if the user wants custom groups), `rewrite-changelog`, `release-emoji`, `changelog-links`.
A formatter that checks the repository (Prettier, spotless) requires `pre-commit-script: scripts/format.sh` - a POSIX
shell script with shebang and the executable bit (`chmod +x`) that formats the generated changelog; the pipeline must
the script can only use tools available where relwolf runs (see the CI references). See /configuration/changelog and /configuration/relwolf-yaml.

## 6. Release request

`pull-request-title`, `release-commit-message` (must satisfy the commit lint rules), `pull-request-body`, `labels`,
`draft`, `assignees`, `reviewers` (usernames), `release-name`, `branch-prefix`, `no-changes-text` (text for linked packages without changes). Ask for assignees and reviewers; do not
invent usernames.

## 7. AI release notes (optional)

Disabled unless `changelog`, `release` or `additional-files` is set. Data (commits or the diff) is sent to the
provider - tell the user and let them choose.

| Question | Key                                                    | Notes                                                                                                                                                                             |
| -------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider | `provider`                                             | `copilot-cli` (default, secret `COPILOT_GITHUB_TOKEN` with "Copilot Requests"), `openai` (`base-url`, `model`, `RELWOLF_AI_API_KEY`), `anthropic` (`model`, `RELWOLF_AI_API_KEY`) |
| Outputs  | `release: true`, `changelog: true`, `additional-files` | where the notes appear                                                                                                                                                            |
| Trigger  | `generate: always` or `manual`                         | `manual` only generates with `RELWOLF_GENERATE_AI_RELEASE_NOTES=true`, saves quota                                                                                                |
| Context  | `context`                                              | `changelog`, `commits` (default), `full-diff` (+ `include-paths`, `exclude-paths`, `max-input-chars`)                                                                             |
| Style    | `language`, `audience`, `prompt`, `model`              | free text                                                                                                                                                                         |

See /configuration/ai-release-notes.

## 8. Messages (optional)

`messages: [{type: slack|teams|webhook, sources: [release|changelog|ai-release|ai-changelog|ai-file:<file>], packages?, webhook-url-env?, template?}]`.
The webhook URL is a secret read from `RELWOLF_MESSAGE_WEBHOOK_URL` or the variable named by `webhook-url-env`; never
write it into a file. See /configuration/messages.

## Constraints to respect

- `linked-tags: single` requires `linked-versions`.
- Every file that contains an `x-relwolf-*` marker must be listed as a `generic` updater (package or top-level).
- Unknown keys are rejected; do not add keys that are not in the schema.
