# Commit linting (Conventional Commits only)

relwolf derives versions from squashed commit titles (merge/pull request titles). Linting keeps those valid. Skip
this entirely for `strategy: changesets`.

Ask: add commit linting? Options: skip (default if some already exists), commitlint on commits (local hook), check
the pull/merge request title in CI, or both.

## Detect first

Look for `commitlint.config.*`, `.commitlintrc*`, `@commitlint/*` in `package.json`, `.husky/`, `lefthook.yml`,
`.pre-commit-config.yaml`, and an existing CI title check. Extend what exists; do not duplicate it.

## JavaScript projects

- Add dev dependencies `@commitlint/cli` and `@commitlint/config-conventional` with the package manager of the
  project (pin exact versions if the repository pins). Config `commitlint.config.mjs`:

  ```js
  export default {extends: ['@commitlint/config-conventional']};
  ```

- Local hook with husky or lefthook, `commit-msg`: `npx --no -- commitlint --edit "$1"`. Husky needs the `prepare`
  script (`husky`).
- Include the types used in `patch-types`/`minor-types` (default conventional types: build, chore, ci, docs, feat,
  fix, perf, refactor, revert, style, test).

## Other projects

Prefer a CI check of the title (GitHub: a workflow on `pull_request` running `npx commitlint` on the title with
`echo "${{ github.event.pull_request.title }}" | npx commitlint`, passing the title through `env:` rather than inline
interpolation; GitLab: a job on merge request pipelines using `$CI_MERGE_REQUEST_TITLE`). Or use `pre-commit` with the
`commitlint` hook if the repository already uses it.

## Important

- The release request title and `release-commit-message` of relwolf default to `chore(release): Create release ${tags}`,
  which passes `config-conventional`; if the user sets a custom subject case rule, adjust these templates accordingly.
- Squash merging uses the request title as commit message: enable "default to pull request title" (GitHub) or the squash
  commit template (GitLab) so the lint applies to the final commit.
