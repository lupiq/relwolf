# Getting started

relwolf follows the workflow of Google's [release-please](https://github.com/googleapis/release-please):

1. On every push to the default branch, relwolf reads the
   [Conventional Commits](https://www.conventionalcommits.org/) since the last release and determines the next
   [SemVer](https://semver.org/) version.
2. It opens (or updates) a **release merge request** from the branch `relwolf/<branch>` (for example `relwolf/main`)
   into the default branch. It contains the updated changelog and the new version in your project files.
3. When that merge request is merged, relwolf **tags** the resulting commit on the default branch (`v1.2.3`) and creates
   a **release** whose description is the changelog entry.

relwolf runs once per job (no daemon, no webhooks) and is shipped as a Docker image, so it can be used directly as the
`image:` of a GitLab CI job or through the GitHub Action.

## Choose your platform

|             | GitLab                             | GitHub                        |
| ----------- | ---------------------------------- | ----------------------------- |
| How to run  | Docker image as the image of a job | `lupiq/relwolf` GitHub Action |
| Release     | Merge request                      | Pull request                  |
| Setup guide | [GitLab guide](/guide/gitlab)      | [GitHub guide](/guide/github) |

See [GitHub vs. GitLab](/reference/github-vs-gitlab) for all differences.

## Requirements

- Squash merging (GitLab: _Fast-forward merge_ with _Squash_). relwolf assumes there are no merge commits.
- A full git clone with all tags. relwolf aborts with a clear error on shallow clones.
- An access token with permission to push the branch `relwolf/<branch>`, create merge requests, tags and releases.
- Commits following [Conventional Commits](https://www.conventionalcommits.org/).

## Next steps

- Set up the [GitLab](/guide/gitlab) or [GitHub](/guide/github) job.
- Learn [how it works](/guide/how-it-works) and which [commits bump what](/guide/version-rules).
- Add a [relwolf.yaml](/configuration/) to update version files such as `package.json` or `pom.xml`.
