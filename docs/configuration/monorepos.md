# Monorepos

```yaml [relwolf.yaml]
packages:
  '.':
    updaters: [{type: package-json}]
  services/api:
    component: api # tags: api-v1.2.3
    updaters:
      - type: pom-xml
```

- Packages are versioned independently and listed together in **one** release merge request.
- A package at `.` ignores changes inside other configured packages.
- Only one package may omit `component`; every other package needs one. The component is the tag prefix
  (`api-v1.2.3`).
- Only commits touching a package's path count for that package.
- Updater and changelog paths are relative to the package path.

## Forcing versions per package

With [`RELWOLF_RELEASE_AS`](/guide/release-as) use `component=version`, for example `api=2.0.0`. If every package has a
component, a bare version is an error.
