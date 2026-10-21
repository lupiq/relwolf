## [0.5.0](https://github.com/lupiq/relwolf/compare/v0.4.0...v0.5.0) - 2026-10-21

### 🚀 Features

- Add possibility to add influence the release title from the MR and add random emoji

### 📚 Documentation

- Improve docs about version rules
- Add contribution and security docs
- Reduce duplicates and add more reference links in docs

### 👷 CI

- Improve stability of Docker build
- Configure relwolf and Renovate to use the `build` commit type and trigger patch releases
- Trigger patch release for `docs` as well

## [0.4.0](https://github.com/lupiq/relwolf/compare/v0.3.0...v0.4.0) - 2026-10-20

### 🚀 Features

- Add pagination and retries to different providers
- Add more configuration options
- Imrprove monorepo and synced version handling

### 📚 Documentation

- Remove `x-relwolf` markers from code snippets
- Add MIT license

### 🧪 Testing

- Add automated E2E tests for GitLab.com integration
- Add test reports, codecov.io and integrate badges in `README.md`
- Improve overall test coverage

## [0.3.0](https://github.com/lupiq/relwolf/compare/v0.2.0...v0.3.0) - 2026-10-19

### 🚀 Features

- Improve MR/PR and reverted commit handling
- Make MR/PR title configurable

### 🐛 Bug Fixes

- Change GitHub action name to be unique

### 👷 CI

- Update used actions to latest version

## [0.2.0](https://github.com/lupiq/relwolf/compare/v0.1.0...v0.2.0) - 2026-10-19

### 🚀 Features

- Add GitHub Action and improve generic updater
- Add possibility to set the next version manually

### 📚 Documentation

- Improve `README.md`
- Add docs poweder by VitePress
- Improve SEO of the new VitePress docs

### 🎨 Styling

- Improve `git-cliff` config

### 👷 CI

- Add Renovate to update dependencies autimatically
- Fix docker build

## [0.1.0] - 2026-10-17

### 🚀 Features

- Add initial implementation of relwolf

### 📦 Build

- Add eslint
