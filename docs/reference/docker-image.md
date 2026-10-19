# Docker image

`ghcr.io/lupiq/relwolf` (linux/amd64, linux/arm64), built by GitHub Actions on every release tag. The image is public and
contains Node.js, git and relwolf with git-cliff.

| Tag            | Meaning                         |
| -------------- | ------------------------------- |
| `latest`       | latest release                  |
| `X.Y.Z`        | exact version                   |
| `X.Y`          | latest patch of a minor version |
| `X`            | latest minor of a major version |
| `sha-<commit>` | a specific build                |

```yaml
image: ghcr.io/lupiq/relwolf:1 # x-relwolf-major
```

The image has **no `ENTRYPOINT`** (GitLab overrides it), and `relwolf` is on the `PATH`.

::: info
relwolf detects the provider and branch from CI environment variables, so it is meant to run inside CI jobs.
:::
