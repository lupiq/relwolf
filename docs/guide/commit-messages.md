---
title: Writing commit messages for relwolf
description: Best practices for Conventional Commits - type, description, scope with ticket numbers, breaking changes - and how to enforce them locally with Git hooks.
---

# Commit messages

relwolf derives the next version and the changelog from your [Conventional Commits](https://www.conventionalcommits.org/).
The [version rules](/guide/version-rules) describe which commits release what; this page covers how to write and
enforce good messages.

## Best practices

relwolf only needs a valid header (`type(scope)!: Description`). Everything else is up to your team; these conventions
keep a history readable and the changelog useful.

::: info Opinionated
These rules are the maintainers' opinion, not part of the Conventional Commits specification. relwolf only requires a
valid header; for example, a capitalised description is a team convention that you can drop or change.
:::

```text
type(optional scope)!: Description

Optional body: why the change was made and how it differs from before.

Optional footer: Closes #123
BREAKING CHANGE: what breaks and how to migrate
```

- **Type.** Use a known type in lower case: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`.
  Only the types in [`minor-types` and `patch-types`](/configuration/relwolf-yaml#commit-types) trigger a release.
- **Description.** Write it so that it completes the sentence "If applied, this commit will …": imperative, present
  tense, starts with a capital letter, no full stop. `Add search` rather than `added search` or `Adds search`.
- **Code in backticks.** Wrap class, function, file and option names in backticks, for example
  ``fix(cart): Handle null in `OrderService.submit` ``. Markdown renders them as code in changelogs and release notes.
- **Keep it short.** Aim for about 70 characters in the header. Put details in the body, not in the description.
- **Body.** Explain the motivation and contrast it with the previous behaviour. Separate it from the header with an empty
  line.
- **Breaking changes.** Add `!` before the colon, e.g. `feat(api)!: Remove status endpoint`, and describe the impact in
  a `BREAKING CHANGE:` footer if the header is not enough. Either one bumps the major version.
- **One logical change per commit.** The bump level and the changelog are derived per commit, so mixed commits end up
  in the wrong place.
- **Squash merges.** relwolf analyses the commits on the default branch, so with squash merging the squash commit
  message counts, not the individual commits and not necessarily the merge request title. Check what your platform
  proposes as the default squash message. Configuring the repository to use the first commit of the feature branch
  works well; then that commit has to follow the format.

### Scopes and ticket references

A scope is optional and free text, so anything except `)` works. Common styles:

| Style             | Example                                         | Use when                                                  |
| ----------------- | ----------------------------------------------- | --------------------------------------------------------- |
| Scope = component | `fix(cart): Prevent ordering an empty cart`     | The changelog should group or label changes by component. |
| Scope = ticket    | `fix(PROJ-123): Prevent ordering an empty cart` | You track every change in Jira and want it in the header. |
| Scope = issue     | `feat(#42): Add search`                         | You work with GitHub or GitLab issue numbers.             |
| Ticket in footer  | `fix(cart): Prevent ordering an empty cart`     | You want a component scope and a ticket link.             |

For the last style, add the reference in the footer:

```text
fix(cart): Prevent ordering an empty cart

Orders without items failed in the payment step.

Closes PROJ-123
```

::: tip Choose one style per project
A ticket scope makes every header traceable, but the scope no longer names the component. If your
[`cliff.toml`](/configuration/changelog) prints the scope in the changelog, it will show the ticket number. A component
scope keeps the changelog tidy and the ticket in the footer. Mixing both in one project makes the history inconsistent.
:::

Breaking changes work the same way with any scope:

```text
feat(PROJ-456)!: Remove ticket list endpoint

BREAKING CHANGE: The ticket endpoints no longer support listing all entities.
```

## Tooling

relwolf ignores commits that do not follow the format, so a wrong header silently means "no release". A local Git hook
catches mistakes before they reach the repository. relwolf itself uses [Husky](https://typicode.github.io/husky/) and
[commitlint](https://commitlint.js.org/); see its
[`.husky/commit-msg`](https://github.com/lupiq/relwolf/blob/main/.husky/commit-msg) and
[`commitlint.config.ts`](https://github.com/lupiq/relwolf/blob/main/commitlint.config.ts) for a working setup.

Install the tools:

```sh
pnpm add -D husky @commitlint/cli @commitlint/config-conventional
pnpm exec husky init
```

Add a `commitlint.config.js` that enforces the capitalised description from the [best practices](#best-practices):

```js [commitlint.config.js]
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'always', 'sentence-case'],
  },
};
```

The preset forbids sentence case by default, so the `subject-case` rule has to be overridden. Then create the hook
`.husky/commit-msg`:

```sh [.husky/commit-msg]
pnpm commitlint --edit "$1"
```

A commit such as `fix: fix typo` is now rejected until the description starts with a capital letter. Husky installs the
hooks on `pnpm install` through the `prepare` script, so every contributor gets them without extra steps.

### Without Node.js

The same idea works in any ecosystem, so you do not need a JavaScript toolchain just for commit linting. Examples:
[pre-commit](https://pre-commit.com/) (Python, hooks for any language), [Lefthook](https://lefthook.dev/) (a single Go
binary), [Commitizen](https://commitizen-tools.github.io/commitizen/) (Python), [Cocogitto](https://docs.cocogitto.io/)
(Rust) and [git-conventional-commits](https://github.com/qoomon/git-conventional-commits). Pick whichever fits your
stack and check that it can enforce a capitalised description.

::: tip Hooks are a convenience, not a guarantee
Contributors can skip hooks with `git commit --no-verify`. With squash merging, only the squash commit message ends up
on the default branch, so make sure it is validated too, for example by running `commitlint` on the first commit of
the branch in your CI.
:::
