# GitLab CI

Add the job to `.gitlab-ci.yml` (works with gitlab.com and self-managed). Reuse an existing stage (for example
`deploy`) or add a `release` stage to `stages:`.

```yaml
relwolf:
  image: ghcr.io/lupiq/relwolf:0 # x-relwolf-major
  stage: release
  resource_group: relwolf
  variables:
    GIT_DEPTH: 0 # relwolf needs the full history and all tags
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - relwolf
```

- The image has no `ENTRYPOINT`; `relwolf` is on the `PATH`. Do not add an `entrypoint` override.
- Keep `:0 # x-relwolf-major` as written unless https://relwolf.lupiq.io/guide/gitlab shows a newer major.
- If the project uses an include-based setup, create `.gitlab/ci/relwolf.yml` and include it instead.
- A `pre-commit-script` runs inside the relwolf image (Node, npm, git, POSIX shell). Tools it needs must be installed in `before_script` of the job or run via `npx --yes <tool>`.
- `generate: manual` AI release notes: add a rule or variable so `RELWOLF_GENERATE_AI_RELEASE_NOTES=true` can be set
  when running the pipeline manually.

## Token (manual)

Personal or project access token with the `api` scope and role Developer or higher, stored as the masked CI/CD
variable `RELWOLF_TOKEN`. Optional masked variables: `COPILOT_GITHUB_TOKEN`, `RELWOLF_AI_API_KEY`,
`RELWOLF_MESSAGE_WEBHOOK_URL`.

## Project settings (manual)

Merge method _Fast-forward merge_ with _Squash_ enabled; _Delete source branch_ as default is recommended.
