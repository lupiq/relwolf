---
title: FAQ
description: Answers to common questions about relwolf - configuration, changelogs, merge methods, supported platforms, monorepos and troubleshooting.
head:
  - - script
    - type: application/ld+json
    - '{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": "Do I need a relwolf.yaml?", "acceptedAnswer": {"@type": "Answer", "text": "No. Without one, relwolf releases a single root package and updates no version files. Add a relwolf.yaml to keep files such as package.json or pom.xml in sync, to release a monorepo or to change defaults."}}, {"@type": "Question", "name": "Do I need a cliff.toml?", "acceptedAnswer": {"@type": "Answer", "text": "No. Without one, git-cliff''s built-in default configuration produces the changelog. Add a cliff.toml to control groups, templates and links, see Changelog."}}, {"@type": "Question", "name": "What happens to commits that are not Conventional Commits?", "acceptedAnswer": {"@type": "Answer", "text": "They are ignored: they never trigger a release, and with git-cliff''s default configuration they are left out of the changelog. See Version rules and Commit messages."}}, {"@type": "Question", "name": "Can I edit the release notes before releasing?", "acceptedAnswer": {"@type": "Answer", "text": "Yes. The description of the release request contains a release title and a release text. Edit them before merging and relwolf uses your version for the release. See How it works."}}, {"@type": "Question", "name": "Does relwolf push to my default branch?", "acceptedAnswer": {"@type": "Answer", "text": "No. relwolf uses Git read-only; the release commit, the release request, labels, tags and releases are written through the GitLab or GitHub API. Your default branch only changes when you merge the release request."}}, {"@type": "Question", "name": "Which merge method do I need?", "acceptedAnswer": {"@type": "Answer", "text": "Squash merging (GitLab: Fast-forward merge with Squash). relwolf assumes there are no merge commits. See Getting started."}}, {"@type": "Question", "name": "Does it work with self-managed GitLab and GitHub Enterprise?", "acceptedAnswer": {"@type": "Answer", "text": "Yes. relwolf supports gitlab.com, self-managed GitLab, github.com and GitHub Enterprise. See GitHub vs. GitLab."}}, {"@type": "Question", "name": "Do I have to install Node.js?", "acceptedAnswer": {"@type": "Answer", "text": "No. relwolf is shipped as a Docker image for GitLab CI and as a GitHub Action, and git-cliff is bundled. See the GitLab and GitHub guides."}}, {"@type": "Question", "name": "Can I force a version such as 1.0.0?", "acceptedAnswer": {"@type": "Answer", "text": "Yes, with RELWOLF_RELEASE_AS or the action input release-as, without an empty commit. See Controlling the next version."}}, {"@type": "Question", "name": "Can I release a monorepo?", "acceptedAnswer": {"@type": "Answer", "text": "Yes, with independent or linked versions and one release request or one per package. See Monorepos."}}, {"@type": "Question", "name": "Why did my push not create a release request?", "acceptedAnswer": {"@type": "Answer", "text": "Usually there is no releasable commit since the last tag, or the pipeline is not a branch pipeline for the default branch. See Troubleshooting."}}, {"@type": "Question", "name": "Why does CI not run on the release pull request on GitHub?", "acceptedAnswer": {"@type": "Answer", "text": "Events created with GITHUB_TOKEN do not trigger workflows. Use a personal access token or a GitHub App token as RELWOLF_TOKEN, see Troubleshooting."}}]}'
---

# FAQ

## Do I need a relwolf.yaml?

No. Without one, relwolf releases a single root package and updates no version files. Add a [relwolf.yaml](/configuration/relwolf-yaml) to keep files such as `package.json` or `pom.xml` in sync, to release a monorepo or to change defaults.

## Do I need a cliff.toml?

No. Without one, git-cliff's built-in default configuration produces the changelog. Add a `cliff.toml` to control groups, templates and links, see [Changelog](/configuration/changelog#do-i-need-a-cliff-toml).

## What happens to commits that are not Conventional Commits?

They are ignored: they never trigger a release, and with git-cliff's default configuration they are left out of the changelog. See [Version rules](/guide/version-rules) and [Commit messages](/guide/commit-messages).

## Can I edit the release notes before releasing?

Yes. The description of the release request contains a release title and a release text. Edit them before merging and relwolf uses your version for the release. See [How it works](/guide/how-it-works).

## Does relwolf push to my default branch?

No. relwolf uses Git read-only; the release commit, the release request, labels, tags and releases are written through the GitLab or GitHub API. Your default branch only changes when you merge the release request.

## Which merge method do I need?

Squash merging (GitLab: Fast-forward merge with Squash). relwolf assumes there are no merge commits. See [Getting started](/guide/getting-started#requirements).

## Does it work with self-managed GitLab and GitHub Enterprise?

Yes. relwolf supports gitlab.com, self-managed GitLab, github.com and GitHub Enterprise. See [GitHub vs. GitLab](/reference/github-vs-gitlab).

## Do I have to install Node.js?

No. relwolf is shipped as a Docker image for GitLab CI and as a GitHub Action, and git-cliff is bundled. See the [GitLab](/guide/gitlab) and [GitHub](/guide/github) guides.

## Can I force a version such as 1.0.0?

Yes, with `RELWOLF_RELEASE_AS` or the action input `release-as`, without an empty commit. See [Controlling the next version](/guide/release-as).

## Can I release a monorepo?

Yes, with independent or linked versions and one release request or one per package. See [Monorepos](/configuration/monorepos).

## Why did my push not create a release request?

Usually there is no releasable commit since the last tag, or the pipeline is not a branch pipeline for the default branch. See [Troubleshooting](/reference/troubleshooting#nothing-happens).

## Why does CI not run on the release pull request on GitHub?

Events created with `GITHUB_TOKEN` do not trigger workflows. Use a personal access token or a GitHub App token as `RELWOLF_TOKEN`, see [Troubleshooting](/reference/troubleshooting#no-ci-on-the-release-pull-request-github).
