# Validation

## Before writing (step 3)

Check the prepared `relwolf.yaml` against these rules:

- Valid YAML; only keys of the schema (https://relwolf.lupiq.io/schema.json - fetch it if unsure about a key).
- Every `packages` path exists; every updater `path` exists relative to its package (top-level `updaters` relative to
  the repository root); `json`, `yaml`, `toml` and `generic` updaters have a `path`; the keys exist in the file.
- `generic` files contain an `x-relwolf-version` (or `x-relwolf-version:<component>`) marker, or the user agreed to
  add it. Top-level `updaters` only support `type: generic`.
- At most one package without `component`; components are unique, valid tag parts, and not `root`.
- `linked-tags: single` only together with `linked-versions`; linked groups have at least two packages and a package is
  in one group only.
- `ai-release-notes`: at least one output (`changelog`, `release`, `additional-files`); `openai` has `base-url` and
  `model`, `anthropic` has `model`; `token-url` only with `openai`.
- `messages[*].webhook-url-env` is a variable name, not a URL.
- No secrets in any file.
- `pre-commit-script` exists, has a shebang and is executable.

## After writing (step 5)

- Parse `relwolf.yaml` (for example `python -c "import yaml,sys;yaml.safe_load(open('relwolf.yaml'))"` or the
  repository's tooling).
- Check the keys against `https://relwolf.lupiq.io/schema.json` (fetch it; convert the YAML to JSON with any
  available tool and validate with a JSON Schema validator if one is installed). Do not install anything permanently
  in the repository for this.
- Run the repository's own linters/formatters on the new files (Prettier, YAML lint, workflow lint such as
  `actionlint`, `glab ci lint`) if present.
- `git status` should show only the intended files. Do not stage or commit.
