# Release summaries

## 0.14.1 - 2026-11-17

The documentation was substantially reorganized and expanded to make relwolf easier to evaluate and operate. The
landing page now explains the **target audience** and **release workflow** more clearly, while new and revised guides
cover **release configuration**, **Conventional Commits**, **git-cliff**, recipes, FAQs, and best practices.

The documentation site also gained a **release flow chart**, clearer release guidance, improved readability and
correctness, and refreshed **lupiq branding and colors**.

## 0.14.0 - 2026-11-13

relwolf can now use **Changesets** instead of Conventional Commits as its release strategy. Changesets determines
package versions and changelog content from `.changeset` files, while relwolf continues to own the **release request,
branch, tags, and published releases**.

The new strategy is deliberately isolated from the existing Conventional Commits flow: unsupported relwolf options are
rejected, **workspace package discovery** is used, and Changesets’ versioning and changelog behavior remains
authoritative.

## 0.13.0 - 2026-11-13

Release automation is safer and more predictable. **Tokens are removed from pre-commit script environments** unless
explicitly allowed, **tags and release branch names are validated** before they are trusted, and merged requests from
unexpected forks or branches are skipped with an explanation. HTTP operations also have a **configurable timeout**.

Monorepos can now use **top-level generic updaters with component markers**, existing tags are checked before release
work proceeds, and changelog rendering handles placeholders around horizontal rules correctly. CI gained **Codecov
configuration** and related test coverage improvements.

## 0.12.0 - 2026-11-12

Root changelogs can now include **links to the changelogs of other packages** in a monorepo. The links are generated in
the changelog header, so readers can move from a shared release overview to the detailed history of each component
without changing the package release model.

## 0.11.0 - 2026-11-12

Release emojis can now be written into generated changelog entries. The feature uses the existing **`release-emoji`
setting** and gives each release a visual marker while preserving git-cliff’s normal grouping and formatting.

## 0.10.0 - 2026-11-12

Components can now define **changelog titles dynamically**, including the component name in the generated heading where
needed. This makes independently released package changelogs easier to identify in a monorepo.

Changelog rewriting now preserves **empty version bumps** for packages that must stay synchronized, and the
documentation site includes the project changelog directly so published documentation stays aligned with the
repository.

## 0.9.1 - 2026-11-03

This maintenance release updates **dependency lock files** and changes Renovate’s CI configuration so dependency updates
no longer require dashboard approval. No release workflow behavior changed.

## 0.9.0 - 2026-11-02

relwolf can now **rewrite complete changelogs** when the git-cliff configuration changes, allowing existing entries to be
regenerated instead of leaving old formatting behind. The rewrite path preserves package and release boundaries while
still adding the current release.

**GitHub release-request discovery** was made more reliable, GitHub sandbox end-to-end coverage was added, and the
project moved to **Node.js 26** with matching documentation and build configuration.

## 0.8.1 - 2026-10-26

The documentation site gained better **search-engine indexability**, including improved metadata and discoverability,
along with new logo assets and a dedicated GitHub App avatar.

GitHub releases now use the project’s own **GitHub App**, improving the identity and authentication model used when
relwolf creates release changes.

## 0.8.0 - 2026-10-26

Projects can now run a **custom script before the release commit**, making it possible to format generated changelogs or
apply repository-specific post-processing while still having relwolf capture the resulting file changes.

The documentation was simplified, TypeScript structure was refactored to reduce complexity, and **dependency lock
files** were maintained as part of the release.

## 0.7.0 - 2026-10-23

git-cliff integration now produces more useful **GitHub and GitLab links** in generated changelogs, improving navigation
from a release entry to its source changes.

A published **JSON schema** was added for relwolf configuration, providing editor completion and validation for
`relwolf.yml` or `relwolf.yaml` files.

## 0.6.2 - 2026-10-23

The **release emoji catalogue** was reviewed and entries with negative associations were removed, reducing the chance of
unsuitable release markers. A stale documentation link was removed at the same time.

## 0.6.1 - 2026-10-23

User documentation no longer includes **internal instructions for releasing relwolf itself**, keeping the public
guidance focused on users of the tool.

Additional **favicon variants** were added to improve the project’s presentation across browsers and search results.

## 0.6.0 - 2026-10-21

The main release script now explains its decisions and failures more clearly, making **CI output easier to diagnose**
when a release is skipped or cannot be prepared.

Additional **updater types** were added so more ecosystems and version-file formats can be kept synchronized with the
release version.

## 0.5.0 - 2026-10-21

Release requests can now derive title changes from merge or pull request metadata, allowing a release to be labeled
with a meaningful **release-as value** or description supplied during review. Configurable **release emojis** add a
visual marker to the generated title.

This release also improved version-rule documentation, added contribution and security guidance, strengthened **Docker
build stability**, and standardized CI and Renovate updates on the `build` commit type, including
**documentation-triggered patch releases**.

## 0.4.0 - 2026-10-20

Provider operations gained **pagination and retries**, reducing failures when APIs return multiple pages or transient
errors. Configuration gained more controls, and monorepo and synchronized-version handling was improved for projects
with several packages.

The project added **automated GitLab integration coverage**, test reporting and Codecov integration, clarified code
examples by removing internal markers, and published the MIT license.

## 0.3.0 - 2026-10-19

Merge and pull request processing was improved, including more reliable handling of **reverted commits** and
release-request state. Release request titles became configurable, giving repositories control over the wording shown to
reviewers.

The **GitHub Action name** was changed to be unique, and the CI workflow was updated to current action versions.

## 0.2.0 - 2026-10-19

The **GitHub Action** and **generic updater** were introduced, allowing relwolf to run directly in GitHub Actions and
update arbitrary version locations in repository files. A release can also request an explicit next version without
requiring a synthetic commit.

The **VitePress documentation site** was added and improved, git-cliff configuration was refined, Renovate was
introduced for dependency updates, and the Docker build was repaired.

## 0.1.0 - 2026-10-17

The initial release introduced relwolf’s **release automation workflow**: it analyzes Conventional Commits, calculates
the next version, prepares a release request with changelog and version changes, and creates the tag and release after
approval.

The project also established its initial **linting setup**, providing the baseline quality checks for future
development.
