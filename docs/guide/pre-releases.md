# Pre-releases

Set `prerelease: beta` to publish `1.3.0-beta.1`, `1.3.0-beta.2`, …

```yaml [relwolf.yaml]
prerelease: beta
```

- A new pre-release is only proposed when a releasable commit happened since the previous one.
- Removing the option graduates to the stable version (`1.3.0`) with the changelog covering everything since the last
  stable release.
- The bump level is always computed from the commits since the **last stable** tag; the changelog starts at the last tag
  (of any kind) while in pre-release mode.
- On GitHub, releases are flagged as pre-release. GitLab releases have no such flag, so the hint is only used on GitHub.
- [Partial version markers](/configuration/updaters#partial-markers) are left unchanged for pre-releases, because no
  floating tag exists for them.

| Step                                | Version        |
| ----------------------------------- | -------------- |
| `feat:` after `v1.2.0` with `beta`  | `1.3.0-beta.1` |
| another `fix:`                      | `1.3.0-beta.2` |
| remove `prerelease` and run relwolf | `1.3.0`        |
