# Release Notes

## 🎉 [0.14.1](https://github.com/lupiq/relwolf/releases/tag/v0.14.1) - 2026-11-17

- **Documentation overhaul:** The landing page and guides were reorganized to explain relwolf’s audience, workflow,
  configuration, Conventional Commits, git-cliff, recipes, FAQs, and best practices more clearly.
- **Improved project presentation:** Added a release flow chart, clearer release guidance, readability and correctness
  fixes, and refreshed lupiq branding and colors.

## 🌹 [0.14.0](https://github.com/lupiq/relwolf/releases/tag/v0.14.0) - 2026-11-13

- **Changesets strategy:** relwolf can now use Changesets instead of Conventional Commits to determine package versions
  and changelog content.
  - Changesets reads `.changeset` files and remains authoritative for versioning and changelogs.
  - relwolf continues to manage release requests, branches, tags, and published releases.
  - Unsupported Conventional Commits options are rejected when `strategy: changesets` is selected.
  - Workspace package discovery is used to prepare the release.

## 🛹 [0.13.0](https://github.com/lupiq/relwolf/releases/tag/v0.13.0) - 2026-11-13

- **Safer release automation:** Secrets are removed from pre-commit script environments unless explicitly allowed.
  - Release tags and source branch names are validated before they are trusted.
  - Merged requests from unexpected forks or branches are skipped with an explanatory log message.
- **Monorepo updater support:** Top-level generic updaters can now use component markers to update several packages.
- **Release reliability:** Existing tags are checked before release work proceeds, and HTTP operations support a
  configurable timeout.
- **Changelog correctness:** Placeholders are inserted correctly around horizontal rules in changelog templates.
- **CI coverage:** Added Codecov configuration and related test coverage improvements.

## 🥝 [0.12.0](https://github.com/lupiq/relwolf/releases/tag/v0.12.0) - 2026-11-12

- **Component changelog links:** Root changelogs can now link to the changelogs of other packages in a monorepo.
  - Links are generated in the changelog header.
  - Readers can move from a shared release overview to each component’s detailed history without changing the package
    release model.

## 📌 [0.11.0](https://github.com/lupiq/relwolf/releases/tag/v0.11.0) - 2026-11-12

- **Release emojis in changelogs:** The existing `release-emoji` setting now adds a visual marker to generated changelog
  entries.
  - The emoji is passed through the release-generation flow.
  - git-cliff grouping and formatting remain unchanged.

## ⚓ [0.10.0](https://github.com/lupiq/relwolf/releases/tag/v0.10.0) - 2026-11-12

- **Dynamic component changelog titles:** Components can include their name in generated changelog headings, making
  independently released package histories easier to identify.
- **Synchronized version bumps:** Changelog rewriting preserves empty version bumps for packages that must stay
  synchronized.
- **Documentation changelog:** The documentation site now includes the project changelog directly, keeping published
  docs aligned with the repository.

## 🗺 [0.9.1](https://github.com/lupiq/relwolf/releases/tag/v0.9.1) - 2026-11-03

- **Dependency maintenance:** Updated dependency lock files.
- **Renovate CI:** Dependency updates no longer require dashboard approval.
- No release workflow behavior changed in this maintenance release.

## 🪐 [0.9.0](https://github.com/lupiq/relwolf/releases/tag/v0.9.0) - 2026-11-02

- **Changelog rewriting:** relwolf can now regenerate complete changelogs when the git-cliff configuration changes.
  - Existing release entries can be updated instead of retaining outdated formatting.
  - Package and release boundaries remain intact while the current release is added.
- **GitHub release discovery:** Merged release-request discovery is more reliable.
- **Runtime and testing:** Added GitHub sandbox end-to-end coverage and moved the project to **Node.js 26** with
  matching documentation and build configuration.

## 🗺 [0.8.1](https://github.com/lupiq/relwolf/releases/tag/v0.8.1) - 2026-10-26

- **Documentation discoverability:** Improved search-engine indexability through better metadata and page
  discoverability.
- **Branding assets:** Added new logo assets and a dedicated GitHub App avatar.
- **GitHub authentication:** GitHub releases now use the project’s own GitHub App, improving the identity and
  authentication model for release changes.

## ⛅ [0.8.0](https://github.com/lupiq/relwolf/releases/tag/v0.8.0) - 2026-10-26

- **Pre-commit processing:** Projects can now run a custom script before the release commit.
  - Scripts can format generated changelogs or apply repository-specific post-processing.
  - relwolf captures the resulting file changes in the release commit.
- **Codebase maintenance:** Simplified the documentation and refactored TypeScript structure to reduce complexity.
- **Dependency maintenance:** Updated dependency lock files.

## 🍓 [0.7.0](https://github.com/lupiq/relwolf/releases/tag/v0.7.0) - 2026-10-23

- **Git hosting links:** git-cliff integration now produces more useful GitHub and GitLab links in generated changelogs.
- **Configuration schema:** Added a published JSON schema for relwolf configuration.
  - Editors can provide completion and validation for both `relwolf.yml` and `relwolf.yaml`.

## 🌱 [0.6.2](https://github.com/lupiq/relwolf/releases/tag/v0.6.2) - 2026-10-23

- **Release emoji catalogue:** Removed entries with negative associations to reduce the chance of unsuitable release
  markers.
- **Documentation cleanup:** Removed a stale documentation link.

## ⏰ [0.6.1](https://github.com/lupiq/relwolf/releases/tag/v0.6.1) - 2026-10-23

- **User-focused documentation:** Removed internal instructions for releasing relwolf itself so public guidance remains
  focused on users of the tool.
- **Search presentation:** Added favicon variants for more consistent browser and search-result presentation.

## 🎉 [0.6.0](https://github.com/lupiq/relwolf/releases/tag/v0.6.0) - 2026-10-21

- **Release diagnostics:** The main release script now explains decisions and failures more clearly in CI output.
  - Skipped releases and preparation failures are easier to diagnose.
- **Version synchronization:** Added updater types for more ecosystems and version-file formats.

## 🧁 [0.5.0](https://github.com/lupiq/relwolf/releases/tag/v0.5.0) - 2026-10-21

- **Release title control:** Merge or pull request metadata can influence the generated release title.
  - Reviewers can supply a meaningful `release-as` value or description.
- **Release title emojis:** Configurable release emojis add a visual marker to the generated title.
- **Project operations:** Improved version-rule documentation, added contribution and security guidance, and
  strengthened Docker build stability.
- **CI release rules:** Standardized CI and Renovate updates on the `build` commit type and added
  documentation-triggered patch releases.

## [0.4.0](https://github.com/lupiq/relwolf/releases/tag/v0.4.0) - 2026-10-20

- **Provider resilience:** Provider operations now support pagination and retries, reducing failures from multi-page
  responses and transient errors.
- **Configuration and monorepos:** Added more configuration controls and improved handling of multiple packages and
  synchronized versions.
- **Testing and reporting:** Added automated GitLab integration coverage, test reporting, and Codecov integration.
- **Project hygiene:** Clarified code examples by removing internal markers and published the MIT license.

## [0.3.0](https://github.com/lupiq/relwolf/releases/tag/v0.3.0) - 2026-10-19

- **Merge and pull request handling:** Improved processing of reverted commits and release-request state.
- **Release title configuration:** Repositories can now control the wording shown to reviewers in release requests.
- **GitHub Action identity:** Changed the Action name to be unique.
- **CI maintenance:** Updated the workflow to current action versions.

## [0.2.0](https://github.com/lupiq/relwolf/releases/tag/v0.2.0) - 2026-10-19

- **GitHub Action:** Added the GitHub Action so relwolf can run directly in GitHub Actions.
- **Generic updater:** Added support for updating arbitrary version locations in repository files.
- **Manual versions:** A release can request an explicit next version without requiring a synthetic commit.
- **Project tooling:** Added and improved the VitePress documentation site, refined git-cliff configuration, introduced
  Renovate, and repaired the Docker build.

## [0.1.0](https://github.com/lupiq/relwolf/releases/tag/v0.1.0) - 2026-10-17

- **Initial release workflow:** relwolf analyzes Conventional Commits, calculates the next version, prepares a release
  request with changelog and version changes, and creates the tag and release after approval.
- **Development baseline:** Established the initial linting setup and the project’s baseline quality checks.
