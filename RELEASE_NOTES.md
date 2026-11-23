# Release Notes

## 🧩 [0.16.0](https://github.com/lupiq/relwolf/releases/tag/v0.16.0) - 2026-11-23

- **Breaking change: `changelog` and `release` are now separate outputs.** Previously `changelog: true` put AI notes in both the changelog and the created release. Now **`changelog`** only writes to the changelog entry. The new **`release`** option (`true` or an object with its own options, plus `packages` / `exclude-packages`) adds notes to the created release body.
  - To keep the old behavior, set both `changelog: true` and `release: true`.
  - With both set, notes are generated separately for each.
  - `release` notes can be combined with `rewrite-changelog`, but `changelog` notes cannot.
  - `release` alone is enough to enable the feature. The release request labels each block as changelog, release or file.

- **`include-paths` for the `full-diff` context.**
  - It limits the diff to matching globs (default: all files). `exclude-paths` is applied afterwards.
  - It works at the top level, in `changelog`, in `release` and in `additional-files` entries.
  - It also takes part in the input hash, so changing it regenerates the notes.

- **OAuth 2.0 for the `openai` provider.**
  - A new **`token-url`** option makes relwolf fetch an access token via the client credentials grant.
  - Credentials come from **`RELWOLF_AI_CLIENT_ID`** and **`RELWOLF_AI_CLIENT_SECRET`** instead of `RELWOLF_AI_API_KEY`.
  - `token-url` is a config error with any other provider.
  - The docs add a Swisscom Swiss AI Platform example.
  - Token and 401/403 failures give specific error hints and show up as warnings.

- **Fewer model calls.** Outputs with identical settings (provider, model, prompt, context and so on) now share one model call per release. They get the same text at no extra cost.

- **Release emoji.** With `release-emoji: true`, the random emoji now differs from those of the last 60 releases. relwolf finds them by looking at merged release requests.

- **Changelog docs.** A new section shows how to group commits by scope as nested bullets with git-cliff's Tera `group_by`.

## 🌈 [0.15.0](https://github.com/lupiq/relwolf/releases/tag/v0.15.0) - 2026-11-19

- **AI release notes (new, opt-in):** the new top-level `ai-release-notes` option in `relwolf.yaml` has relwolf ask a model to summarize each release.
  - It is **disabled by default**. It turns on when `changelog` is set (`true` or an object) or `additional-files` has at least one entry.
  - Without either, any other `ai-release-notes` option is a config error.
  - It is not supported with `strategy: changesets`. `changelog` notes can't be combined with `rewrite-changelog`.
  - Each output has its own settings (`provider`, `model`, `context`, `audience`, `language`, `prompt`, `max-input-chars`). Unset values are inherited from the top level.
  - **Outputs:**
    - `changelog` adds the notes above the first `###` section of the new changelog entry and to the created release.
    - Each `additional-files` entry (`file`, `file-title`) prepends an entry to a Markdown file. `file` can use `${path}` and `${component}`.
    - `packages` and `exclude-packages` scope an output per package in monorepos.

- **Providers:**
  - **`copilot-cli`** is the default. It runs the GitHub Copilot CLI with no tool permissions in an empty temp directory, with other tokens stripped from its environment.
    - It needs `COPILOT_GITHUB_TOKEN` or `RELWOLF_AI_API_KEY`: a fine-grained PAT with the **Copilot Requests** permission.
    - `RELWOLF_COPILOT_CLI` sets the executable path.
  - **`openai`** is any OpenAI-compatible `/chat/completions` API. It requires `base-url` and `model`.
  - **`anthropic`** calls the Claude API directly. It requires `model`, and `base-url` defaults to `https://api.anthropic.com/v1`.
  - Both use `RELWOLF_AI_API_KEY`.
  - `base-url` with `copilot-cli` is rejected.

- **Context and audience:**
  - `context` is `changelog`, `commits` (default) or `full-diff`.
    - `full-diff` can be filtered with `exclude-paths`.
    - The context is capped at 30,000 characters by default; `max-input-chars: false` removes the cap.
  - `audience` is free text and defaults to `users`.
  - **Data leaves your repository:** the selected context is sent to the configured provider.

- **Release request workflow:**
  - Notes are rendered between `relwolf:summary` markers in the request body, so reviewers can edit them. Edits are kept, and clearing the text drops the notes.
  - Notes regenerate only when the commits, model, language or prompt change.
  - If generation fails, the release continues and the request shows a warning.
  - `generate: manual` only calls the model when `RELWOLF_GENERATE_AI_RELEASE_NOTES=true`. Stale notes are flagged in a warning.
  - `usage-comment: true` posts a comment on the release request with tokens and cost.
    - Cost is AI credits for Copilot, or a USD estimate from `input-price` and `output-price`.
    - This needs the new provider methods `findComment` and `saveComment`, implemented for GitHub and GitLab.

- **Docker image and CI:**
  - The Docker image now bundles `@github/copilot@1.0.112`. This lets GitHub Action and GitLab CI users run the default provider without installing anything.
  - The release and E2E workflows install the same version.
  - The release workflow gains a `generate-ai-release-notes` input.
  - E2E AI scenarios are skipped without `COPILOT_GITHUB_TOKEN`.
  - Renovate keeps the Copilot CLI version in sync across the image and workflows.

- **Other changes:**
  - Changelog `${component}` placeholders inside AI text are no longer replaced.
  - Commits that git-cliff hides now get the "no changes" placeholder text, like a release with no commits.
  - The docs gain an AI release notes page and a `RELEASE_NOTES.md` page. The nav now shows the version with Changelog and Release notes entries.
  - relwolf's own config now uses AI notes in `RELEASE_NOTES.md` with `generate: manual`.

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
