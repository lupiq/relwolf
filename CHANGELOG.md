# Changelog of relwolf

<!-- git-cliff: end of header -->

## 💡 [0.18.0](https://github.com/lupiq/relwolf/releases/tag/v0.18.0) - 2026-11-27

[See changes](https://github.com/lupiq/relwolf/compare/v0.17.0...v0.18.0)

### 🚀 Features

- **messages**: Add `webhook-url-env` to post entries to different webhooks ([e3e52f1](https://github.com/lupiq/relwolf/commit/e3e52f189f2777c3f869d9ff3bf0ceae5aadb43c))
- **ai-release-notes**
  - Add `entry-title` option for additional files ([b939135](https://github.com/lupiq/relwolf/commit/b93913555013165cf329313aab6c74e0886f56bd))
  - Add `max-output-tokens` and `request-body` and fail on cut-off answers ([3925390](https://github.com/lupiq/relwolf/commit/3925390f3914a192d0ded45ef9b54ecfd8a1582e))

### 🐛 Bug Fixes

- **ai-release-notes**: Add the no-changes-text to additional files without changes ([3761a36](https://github.com/lupiq/relwolf/commit/3761a36c6778650c268ddd7f2474de2313e59512))

### 🧪 Testing

- **release**: Accept linked headings in AI release notes file test ([360bf65](https://github.com/lupiq/relwolf/commit/360bf65d994220f54e5c472a24ab52eb06cd64f0))

---

## 🚢 [0.17.0](https://github.com/lupiq/relwolf/releases/tag/v0.17.0) - 2026-11-24

[See changes](https://github.com/lupiq/relwolf/compare/v0.16.0...v0.17.0)

### 🚀 Features

- **messages**: Notify Slack, Teams or a webhook about new releases ([6cb1de3](https://github.com/lupiq/relwolf/commit/6cb1de3130831728c58ccce991a1e602cf053a6c))

### 🐛 Bug Fixes

- **ai-release-notes**
  - Replace placeholders in `file-title` ([11bb805](https://github.com/lupiq/relwolf/commit/11bb8053bdfe5312b1a5917176fa2f28a207c018))
  - Explain empty AI endpoint answers ([9b9909f](https://github.com/lupiq/relwolf/commit/9b9909f61b935415561c26b3e6bccf54cf2fbf09))

---

## 🧩 [0.16.0](https://github.com/lupiq/relwolf/releases/tag/v0.16.0) - 2026-11-23

[See changes](https://github.com/lupiq/relwolf/compare/v0.15.0...v0.16.0)

### ⚠️ Breaking changes

- **ai-release-notes**: `ai-release-notes.changelog` no longer adds the release notes to the created release. Set the new `ai-release-notes.release` option to write them into the release body as well. ([be22a24](https://github.com/lupiq/relwolf/commit/be22a2423eb8356ebf97a810240cc3becbb8b5eb))

### 🚀 Features

- **release-emoji**: Make sure the `release-emoji` is not repeated within at least 60 releases ([94671af](https://github.com/lupiq/relwolf/commit/94671af3cf76f28b23af4fa4959352ed956697e2))
- **ai-release-notes**
  - [**breaking**] Add possibility to write notes into the release separately from `changelog` ([be22a24](https://github.com/lupiq/relwolf/commit/be22a2423eb8356ebf97a810240cc3becbb8b5eb))
  - Add `include-paths` as pendant to `exclude-paths` to simplify config ([e1a1a29](https://github.com/lupiq/relwolf/commit/e1a1a293479d05b4f7dbc2886b8cb4440bc3c5e8))
  - Call model only once if configured outputs share exact same settings ([7ab7c6e](https://github.com/lupiq/relwolf/commit/7ab7c6e772e7d8f80e5b7322587068b3e7b2aae2))
  - Support OAuth 2.0 client credentials for `openai` provider via `token-url` ([d517c67](https://github.com/lupiq/relwolf/commit/d517c67a53bdcd81817793aff561b1fc8c3cdbdc))

### 📚 Documentation

- **ai-release-notes**: Clarify when AI release notes are regenerated ([52c9a7e](https://github.com/lupiq/relwolf/commit/52c9a7e99d075df9ac1f6ea6ac4edc10b229de64))

### 🧪 Testing

- **E2E**: Improve tag deletion retries for GitLab ([9353594](https://github.com/lupiq/relwolf/commit/9353594f12b1c2248b7dd61fb6898e7986ec60b1))

---

## 🌈 [0.15.0](https://github.com/lupiq/relwolf/releases/tag/v0.15.0) - 2026-11-19

[See changes](https://github.com/lupiq/relwolf/compare/v0.14.1...v0.15.0)

### 🚀 Features

- Add the possibility to add an AI generated summary to the release and changelogs ([0cbf63a](https://github.com/lupiq/relwolf/commit/0cbf63a9e1e29f5bb6654f25c565caa8503acb00))
- Add possibility to configure the `context` for the AI summary ([53c8cb9](https://github.com/lupiq/relwolf/commit/53c8cb994007aa522fd809f6990caf93b112b336))
- Add release emoji to release notes too ([92b7989](https://github.com/lupiq/relwolf/commit/92b7989a78174d9aad2a05d6f97bbefd774d2445))
- Add Anthropic as a direct provider ([d745658](https://github.com/lupiq/relwolf/commit/d7456583fae6033eff728ac052e413745e09028b))
- Improve the AI release notes config ([81474ea](https://github.com/lupiq/relwolf/commit/81474ea9106d34342641d82709daff0bb5a2d35a))
- Add possibility to explicitly in- or exclude packages in/from AI release notes generation ([837c044](https://github.com/lupiq/relwolf/commit/837c04471b87c950801fa738067b271fbd7453ce))
- Bundle `@github/copilot` in the Docker container ([ff1f408](https://github.com/lupiq/relwolf/commit/ff1f408cf5676d3fcba6ab7889ee00b4a68c52f8))
- Add the possibility to show the tokens which were used to generate the AI release notes ([0e7a8a6](https://github.com/lupiq/relwolf/commit/0e7a8a6669a27364fa44abccbe29dbef6f60bd01))
- Add manual mode for AI release notes to safe costs ([a339c5f](https://github.com/lupiq/relwolf/commit/a339c5fb3020ed0f4d2630511e07a0692d964d0b))
- Add the possibility to configure the `max-input-chars` for AI release notes ([bb205fe](https://github.com/lupiq/relwolf/commit/bb205fe31e8986284eaf8d449a5b2a1c5be16c6f))

### 🐛 Bug Fixes

- Use the Copilot CLI instead of the retired GitHub Models ([d692c2b](https://github.com/lupiq/relwolf/commit/d692c2b5b50ca7b68670779d9c6ddbb4e6762b8a))
- Add the `no-changes-text` if there are no commits in the changelog ([542f406](https://github.com/lupiq/relwolf/commit/542f4063be333a672dd3cdf865e32e79c31c16af))
- Diff the first release against the empty tree for AI release notes ([ef300bb](https://github.com/lupiq/relwolf/commit/ef300bb90ae919f88dd97f056fb0dcc5cd0c5470))
- Fix big inputs for Copilot CLI (`spawn E2BIG`) ([0469675](https://github.com/lupiq/relwolf/commit/04696752f7eae2471a8033cf4fe683e70e59c1c3))

### 📚 Documentation

- Improve description of GitHub Action ([75402b7](https://github.com/lupiq/relwolf/commit/75402b74625f21b53924a94e3b24ca6af921ae51))
- Fix flow example on landing page ([3809eed](https://github.com/lupiq/relwolf/commit/3809eede81ba497428bce274c4a11cb66adcf8a8))
- Fix timeline examples ([6481ffe](https://github.com/lupiq/relwolf/commit/6481ffe3da1c76505afea9e9d8e996a1f7e3cf04))
- Add the release notes to an own markdown file ([88e791b](https://github.com/lupiq/relwolf/commit/88e791b4e7bad4ea42b14c2b5c27ddc132f9d2c0))
- Add AI release notes to release-please comparison ([403812c](https://github.com/lupiq/relwolf/commit/403812c79af5f1f5e483b467c6b107324ed87b0d))
- Add AI release notes recipe ([3f9adf4](https://github.com/lupiq/relwolf/commit/3f9adf455e012fdf1ae472c5bc0f79cccbb49016))

### 🚜 Refactor

- Rename ai-summary to ai-release-notes ([500ab43](https://github.com/lupiq/relwolf/commit/500ab43aed3674b4db3f29876d12bdccbd1a79c5))

### 🧪 Testing

- Add AI summary test for monorepos ([d1595a6](https://github.com/lupiq/relwolf/commit/d1595a66196ae7c07d111621aee0baa2466cf2d5))
- Add more tests for new AI release notes ([c8126a2](https://github.com/lupiq/relwolf/commit/c8126a29dd6a76a5750e460e70f1dcd793b1b316))
- Add E2E scenarios for AI release notes ([cbe4d8e](https://github.com/lupiq/relwolf/commit/cbe4d8e9ce4ca873bb1c647d9eab7854d93ff951))

---

## 🎉 [0.14.1](https://github.com/lupiq/relwolf/releases/tag/v0.14.1) - 2026-11-17

[See changes](https://github.com/lupiq/relwolf/compare/v0.14.0...v0.14.1)

### 📚 Documentation

- Improve docs in regards of correctness and readability ([a922e75](https://github.com/lupiq/relwolf/commit/a922e75dabb896c5b006a2a5b1785c323a52783e))
- Improve `README.md` ([cc9b076](https://github.com/lupiq/relwolf/commit/cc9b07620cfb447941450ee757e3a3489acf0671))
- Improve landing page ([d3f38d9](https://github.com/lupiq/relwolf/commit/d3f38d91272391a583b6545931816aea6a37309f))
- Add section "Who is it for?" ([83a26c0](https://github.com/lupiq/relwolf/commit/83a26c0960b57948cdeac3a2c99175758c5a78a5))
- Add flow-chart ([265ec17](https://github.com/lupiq/relwolf/commit/265ec17e6498e34527aab6159e2cf16ea60ddddf))
- Use lupiq brand colors for docs ([b7e8749](https://github.com/lupiq/relwolf/commit/b7e874950154816b2296d08e5935e5a27ce128d9))
- Improve sections about conventional commits ([eb902b4](https://github.com/lupiq/relwolf/commit/eb902b44a0eedf24c8361f2cd30c7bcf849101e4))
- Improve section about `git-cliff` ([359f733](https://github.com/lupiq/relwolf/commit/359f7338bb9f48038c65b8141b0ba060454ca0dc))
- Improve section about best practices ([fbfe7f2](https://github.com/lupiq/relwolf/commit/fbfe7f26b1b28d483e66e058d8044d4280c6ba89))
- Add own pages for commit messages, recipes and FAQs ([719977f](https://github.com/lupiq/relwolf/commit/719977f64741023435eb961cf432077422004abf))

---

## 🌹 [0.14.0](https://github.com/lupiq/relwolf/releases/tag/v0.14.0) - 2026-11-13

[See changes](https://github.com/lupiq/relwolf/compare/v0.13.0...v0.14.0)

### 🚀 Features

- Add possibility to use Changesets instead of conventional commits ([9335f86](https://github.com/lupiq/relwolf/commit/9335f864c8b8ef3039d96a1e0b5f1edd06f085db))

---

## 🛹 [0.13.0](https://github.com/lupiq/relwolf/releases/tag/v0.13.0) - 2026-11-13

[See changes](https://github.com/lupiq/relwolf/compare/v0.12.0...v0.13.0)

### 🚀 Features

- Remove secrets from `preCommitScript` env to avoid leaking ([da662d8](https://github.com/lupiq/relwolf/commit/da662d80add90ff4ff48bf526e5c8281183ed1a1))
- Abort the release process if the corresponding tag already exists ([d517858](https://github.com/lupiq/relwolf/commit/d51785872b1be2e5a87e75d33b40187d21fe28df))
- Only tag merged requests from relwolf release branches ([14fa357](https://github.com/lupiq/relwolf/commit/14fa35735e9f5a6f052bdca102b44353a86ca37b))
- Add configurable http timeout ([47558ce](https://github.com/lupiq/relwolf/commit/47558ceb15b03656ee14c98968a2111ccd2fb359))
- Add top-level generic updaters with component markers for monorepos ([5dbaa00](https://github.com/lupiq/relwolf/commit/5dbaa00569d978b3d276a916723ddef84049726a))

### 🐛 Bug Fixes

- Insert `no-changes-text` above a possible horizontal line from the changelog template ([f722f66](https://github.com/lupiq/relwolf/commit/f722f66e8f53c8c58592ef43ff72383bd55a744a))

### 👷 CI

- Add configuration for codecov ([e0a1d0e](https://github.com/lupiq/relwolf/commit/e0a1d0ea79c32e2a36145e038c3ccc16fe61fe09))

---

## 🥝 [0.12.0](https://github.com/lupiq/relwolf/releases/tag/v0.12.0) - 2026-11-12

[See changes](https://github.com/lupiq/relwolf/compare/v0.11.0...v0.12.0)

### 🚀 Features

- Add possibility to insert links to component changelogs into the root changelog ([e466157](https://github.com/lupiq/relwolf/commit/e466157cafc578289a837a65d52e7162cee8214b))

---

## 📌 [0.11.0](https://github.com/lupiq/relwolf/releases/tag/v0.11.0) - 2026-11-12

[See changes](https://github.com/lupiq/relwolf/compare/v0.10.0...v0.11.0)

### 🚀 Features

- Add possibility to write release emoji to changelog ([81cee54](https://github.com/lupiq/relwolf/commit/81cee542e2ad015545c206ef9e8eb56a3c4ec781))

---

## ⚓ [0.10.0](https://github.com/lupiq/relwolf/releases/tag/v0.10.0) - 2026-11-12

[See changes](https://github.com/lupiq/relwolf/compare/v0.9.1...v0.10.0)

### 🚀 Features

- Add possibility to set a dynamic changelog title per component ([069f36c](https://github.com/lupiq/relwolf/commit/069f36c108ab1504210d3276043d0bc6753f71d2))

### 🐛 Bug Fixes

- Keep empty version bumps in multi-module projects if changelog is rewritten ([5011b95](https://github.com/lupiq/relwolf/commit/5011b9527689b7e20e5448ed0f32ea2ddf5d8a21))

### 📚 Documentation

- Include changelog in docs ([ff540c0](https://github.com/lupiq/relwolf/commit/ff540c0988188b1f2611af453ffbd70c72a58004))

---

## 🗺 [0.9.1](https://github.com/lupiq/relwolf/releases/tag/v0.9.1) - 2026-11-03

[See changes](https://github.com/lupiq/relwolf/compare/v0.9.0...v0.9.1)

### 📦 Build

- **deps**: Lock file maintenance (#27) ([43d189a](https://github.com/lupiq/relwolf/commit/43d189ab0ea96146ee8b12ef30fe9e08c0e8ca5f))

### 👷 CI

- Disable Renovate dashboard approval ([ca0ac3c](https://github.com/lupiq/relwolf/commit/ca0ac3ce9ee56d2f383bfef9f6f34bca6f158478))

---

## 🪐 [0.9.0](https://github.com/lupiq/relwolf/releases/tag/v0.9.0) - 2026-11-02

[See changes](https://github.com/lupiq/relwolf/compare/v0.8.1...v0.9.0)

### 🚀 Features

- Add possiblity to rewrite whole changelog(s) if the `git-cliff` config changes ([c3c22a4](https://github.com/lupiq/relwolf/commit/c3c22a4ab130cd69256ad4014cd034aa952a3e9c))

### 🐛 Bug Fixes

- Find just merged release pull requests on GitHub reliably ([b7a271e](https://github.com/lupiq/relwolf/commit/b7a271ef83899645bb97679b253481121851650d))

### 📚 Documentation

- Mention schemastore in docs ([d6f336e](https://github.com/lupiq/relwolf/commit/d6f336ec3ed2fcd7ed596f41b7de095ad55c0c15))

### 🧪 Testing

- Add GitHub sandbox E2E tests ([abf3ab3](https://github.com/lupiq/relwolf/commit/abf3ab337f557468e1b736f4fe72c9dfcc769a09))

### 📦 Build

- Use Node.js v26 and document it correctly ([f926033](https://github.com/lupiq/relwolf/commit/f926033cbca6716fa9a475742d0f7d133f13a5dd))

---

## 🗺 [0.8.1](https://github.com/lupiq/relwolf/releases/tag/v0.8.1) - 2026-10-26

[See changes](https://github.com/lupiq/relwolf/compare/v0.8.0...v0.8.1)

### 📚 Documentation

- Improve indexability of docs ([1929f4e](https://github.com/lupiq/relwolf/commit/1929f4e16f408ae8f790114477c04d444975ee8b))
- Add logos page and special GitHub app avatar with solid background ([7b4e4e5](https://github.com/lupiq/relwolf/commit/7b4e4e56f5be89e2dcfc93bbd7125a23e75edda2))

### 👷 CI

- Use own GitHub app to create Release PRs ([8c8d692](https://github.com/lupiq/relwolf/commit/8c8d69237fd2257b2ae422fbdf77aeac0987ff3c))

---

## ⛅ [0.8.0](https://github.com/lupiq/relwolf/releases/tag/v0.8.0) - 2026-10-26

[See changes](https://github.com/lupiq/relwolf/compare/v0.7.0...v0.8.0)

### 🚀 Features

- Add possibility to run own script before the release commit (e.g. for formatting) ([8710926](https://github.com/lupiq/relwolf/commit/8710926baf7dd27b29024c3030855e5570a0b0c2))

### 📚 Documentation

- Simplify `README.md` and add more links to docs ([ef6a76b](https://github.com/lupiq/relwolf/commit/ef6a76b621ff09c1b742c96a42bc390199e16d8e))

### 🚜 Refactor

- Use TS `Array<>` type instead of `[]` ([7da0205](https://github.com/lupiq/relwolf/commit/7da0205b8ab883d83f9d7bae227523604f2ce19d))
- Reduce cognitive complexity in whole workspace ([0aa5659](https://github.com/lupiq/relwolf/commit/0aa56592805afca7db8350c6c2e5d662517ce7a4))

### 📦 Build

- **deps**: Lock file maintenance (#16) ([9efe3f4](https://github.com/lupiq/relwolf/commit/9efe3f41bc90620c00e8b47522c16e143ee19341))

---

## 🍓 [0.7.0](https://github.com/lupiq/relwolf/releases/tag/v0.7.0) - 2026-10-23

[See changes](https://github.com/lupiq/relwolf/compare/v0.6.2...v0.7.0)

### 🚀 Features

- Improve the usage of git-cliff GitHub / GitLab integration ([3d42b6c](https://github.com/lupiq/relwolf/commit/3d42b6cd0f9eb0106aba14e8f35e6934e1f8a7d8))
- Add schema file for better source completion in `relwolf.yml` ([e48801b](https://github.com/lupiq/relwolf/commit/e48801b367445636604f6218684b6c0b5ef2276b))

---

## 🌱 [0.6.2](https://github.com/lupiq/relwolf/releases/tag/v0.6.2) - 2026-10-23

[See changes](https://github.com/lupiq/relwolf/compare/v0.6.1...v0.6.2)

### 🐛 Bug Fixes

- Improve emoji list (remove negatively associated entries) ([7f3daf9](https://github.com/lupiq/relwolf/commit/7f3daf97a35c889d43a37d87f02a23c874c2dccc))

### 📚 Documentation

- Remove dead link from navigation ([3ecf6b8](https://github.com/lupiq/relwolf/commit/3ecf6b85efa75b769c860bdceb1a09e57b3739bb))

---

## ⏰ [0.6.1](https://github.com/lupiq/relwolf/releases/tag/v0.6.1) - 2026-10-23

[See changes](https://github.com/lupiq/relwolf/compare/v0.6.0...v0.6.1)

### 📚 Documentation

- Remove docs about how to release relwolf itself since it is irrelevant for users ([88a803f](https://github.com/lupiq/relwolf/commit/88a803f8f1d7c8401e179b0398cfda1cc3f9fece))
- Improve Google result listing by adding more favicons ([2e308d0](https://github.com/lupiq/relwolf/commit/2e308d0f9949a03043d8e9adc2235d3f6be91b91))

---

## 🎉 [0.6.0](https://github.com/lupiq/relwolf/releases/tag/v0.6.0) - 2026-10-21

[See changes](https://github.com/lupiq/relwolf/compare/v0.5.0...v0.6.0)

### 🚀 Features

- Improve log ouptput and error messages of main script ([fa81495](https://github.com/lupiq/relwolf/commit/fa81495e22cf9afb9ed63eefe3bfd7832e56d897))
- Add more updaters ([d75eaba](https://github.com/lupiq/relwolf/commit/d75eabafbdc3fc9a15cc7967a771f4e7e7eb589b))

---

## 🧁 [0.5.0](https://github.com/lupiq/relwolf/releases/tag/v0.5.0) - 2026-10-21

[See changes](https://github.com/lupiq/relwolf/compare/v0.4.0...v0.5.0)

### 🚀 Features

- Add possibility to add influence the release title from the MR and add random emoji ([5b07cda](https://github.com/lupiq/relwolf/commit/5b07cda03a0056422beb501bb55f25432a3aefb9))

### 📚 Documentation

- Improve docs about version rules ([ca69cd7](https://github.com/lupiq/relwolf/commit/ca69cd75ff4547c0671ff7525b339fb52a7b74b8))
- Add contribution and security docs ([0e8266a](https://github.com/lupiq/relwolf/commit/0e8266a232faad4c1ee57298d111088c8ec7d2e4))
- Reduce duplicates and add more reference links in docs ([c23ee99](https://github.com/lupiq/relwolf/commit/c23ee995cc566a288c80df01213ed58280c897ea))

### 👷 CI

- Improve stability of Docker build ([2e7e304](https://github.com/lupiq/relwolf/commit/2e7e3048c7466e331a98947dfd2c7cf602690edc))
- Configure relwolf and Renovate to use the `build` commit type and trigger patch releases ([ec9c1a7](https://github.com/lupiq/relwolf/commit/ec9c1a731b5454c358dd32f61be32c4d97c1aeae))
- Trigger patch release for `docs` as well ([21bf4c3](https://github.com/lupiq/relwolf/commit/21bf4c30b08797a7675f7f8c02ebae76448fa615))

---

## [0.4.0](https://github.com/lupiq/relwolf/releases/tag/v0.4.0) - 2026-10-20

[See changes](https://github.com/lupiq/relwolf/compare/v0.3.0...v0.4.0)

### 🚀 Features

- Add pagination and retries to different providers ([aa843b6](https://github.com/lupiq/relwolf/commit/aa843b6cc7984fceef9ec8a1ecbc429807b49b4f))
- Add more configuration options ([80c5705](https://github.com/lupiq/relwolf/commit/80c570564a827edd15fa21e9db45eb8b7e95cca1))
- Imrprove monorepo and synced version handling ([15e7875](https://github.com/lupiq/relwolf/commit/15e7875e3ff508d13990945cb2dbdc5e781a1518))

### 📚 Documentation

- Remove `x-relwolf` markers from code snippets ([a6d7459](https://github.com/lupiq/relwolf/commit/a6d74594ca586c00ea4e7d178873bdc959c78853))
- Add MIT license ([c1cb852](https://github.com/lupiq/relwolf/commit/c1cb852808bcddacaa9855876fd4e483c0904508))

### 🧪 Testing

- Add automated E2E tests for GitLab.com integration ([6f1316f](https://github.com/lupiq/relwolf/commit/6f1316f75eea28f6f7407c984bfe87c45a678d52))
- Add test reports, codecov.io and integrate badges in `README.md` ([be8a85f](https://github.com/lupiq/relwolf/commit/be8a85f2d83c8b5ffe02ff7c644ad6734c4d300a))
- Improve overall test coverage ([7acb2b2](https://github.com/lupiq/relwolf/commit/7acb2b2a61dde593a3f7feea000bd583bbe523dd))

---

## [0.3.0](https://github.com/lupiq/relwolf/releases/tag/v0.3.0) - 2026-10-19

[See changes](https://github.com/lupiq/relwolf/compare/v0.2.0...v0.3.0)

### 🚀 Features

- Improve MR/PR and reverted commit handling ([ac8dbc6](https://github.com/lupiq/relwolf/commit/ac8dbc6371d1b45f93b777af63f3e6da578c097d))
- Make MR/PR title configurable ([10b63f6](https://github.com/lupiq/relwolf/commit/10b63f66c6e7192d23016210b18dd36279661fa1))

### 🐛 Bug Fixes

- Change GitHub action name to be unique ([94f83d0](https://github.com/lupiq/relwolf/commit/94f83d0d913186ab1bf069d9ab9ad7fc9534879a))

### 👷 CI

- Update used actions to latest version ([5016de2](https://github.com/lupiq/relwolf/commit/5016de210d8f3704b79fcea7435067a4469f6729))

---

## [0.2.0](https://github.com/lupiq/relwolf/releases/tag/v0.2.0) - 2026-10-19

[See changes](https://github.com/lupiq/relwolf/compare/v0.1.0...v0.2.0)

### 🚀 Features

- Add GitHub Action and improve generic updater ([526519f](https://github.com/lupiq/relwolf/commit/526519f09826a6b09060d5c47ec0b1c76c5c8b23))
- Add possibility to set the next version manually ([a48ece0](https://github.com/lupiq/relwolf/commit/a48ece0e16c8c37cb21d51aa64a791c01af73439))

### 📚 Documentation

- Improve `README.md` ([00e3331](https://github.com/lupiq/relwolf/commit/00e3331eba9ac19d66e02c59ebe9fcdb7df9734f))
- Add docs poweder by VitePress ([4ce4d7e](https://github.com/lupiq/relwolf/commit/4ce4d7e69c376a9a1d8d389b08ccd5bd0fe356a2))
- Improve SEO of the new VitePress docs ([7c9d043](https://github.com/lupiq/relwolf/commit/7c9d04340b33c4fadf810c075a00abf216f616f5))

### 🎨 Styling

- Improve `git-cliff` config ([b08ca56](https://github.com/lupiq/relwolf/commit/b08ca5681b216feaae69ef0d37863bb9862ea993))

### 👷 CI

- Add Renovate to update dependencies autimatically ([4a7af2c](https://github.com/lupiq/relwolf/commit/4a7af2c912e84217e553b24a76b9b4c71b0c6f70))
- Fix docker build ([7ced15e](https://github.com/lupiq/relwolf/commit/7ced15e9e7d8b03496ebc963ace5ed7fc7196fd6))

---

## [0.1.0](https://github.com/lupiq/relwolf/releases/tag/v0.1.0) - 2026-10-17

### 🚀 Features

- Add initial implementation of relwolf ([ef6a5c1](https://github.com/lupiq/relwolf/commit/ef6a5c11132d811656a3425f358ca79737c7dbb1))

### 📦 Build

- Add eslint ([3f8a793](https://github.com/lupiq/relwolf/commit/3f8a7932f546da7cd19ad0708e1ddddc58b71d90))
