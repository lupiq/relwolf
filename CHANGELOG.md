# Changelog of relwolf

<!-- git-cliff: end of header -->

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
