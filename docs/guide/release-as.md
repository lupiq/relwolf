---
title: Controlling the next version (release-as)
description: Force the next release version, for example 1.0.0, with RELWOLF_RELEASE_AS - without empty commits or special commit message markers.
---

# Controlling the next version

Set `RELWOLF_RELEASE_AS` to force the next version without an empty commit, for example to leave `0.x` with `1.0.0`.

::: code-group

```text [GitLab]
Build → Pipelines → Run pipeline (default branch)
Variable: RELWOLF_RELEASE_AS = 1.0.0
```

```yaml [GitHub]
# workflow_dispatch input "release-as", passed to the action:
- uses: lupiq/relwolf@v0 # x-relwolf-major
  with:
    token: ${{ secrets.RELWOLF_TOKEN }}
    release-as: ${{ inputs.release-as }}
```

:::

## Syntax

`[component=]version`, several entries separated by comma or whitespace.

| Value                 | Meaning                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `1.0.0`, `v1.0.0`     | Release `1.0.0` (a bare version applies to the package without a component, or the only package) |
| `api=2.0.0`           | Release `2.0.0` of the package with `component: api`                                             |
| `api=2.0.0, web=auto` | Several packages; `auto` removes a request                                                       |
| `auto`                | Back to the version computed from the commits                                                    |

## Behaviour

- The request is **stored in the release merge request** and kept on later runs until the merge request is merged.
  Later runs without the variable keep it.
- `auto` removes it again. If the commits then contain nothing to release (only `chore`, `docs`, …), the open release
  merge request is **closed**.
- The version must be **greater than the last tag**; otherwise relwolf fails with a hint to run with
  `RELWOLF_RELEASE_AS=auto`.
- At least one commit must exist since the last tag; otherwise nothing happens.
- With [`prerelease`](/guide/pre-releases) configured, a stable request such as `1.0.0` yields `1.0.0-beta.1`. A
  requested pre-release (`1.0.0-rc.1`) is used verbatim.
- Unknown components and invalid versions fail the run.

## Example: release 1.0.0

1. Merge the commits you want to release into the default branch.
2. Run the pipeline / workflow with `RELWOLF_RELEASE_AS=1.0.0`.
3. relwolf opens `chore(release): prepare for v1.0.0`. The merge request description notes that the version was set
   manually.
4. Merge it. The tag `v1.0.0` and the release are created.
