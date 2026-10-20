# Security policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/lupiq/relwolf/security/advisories/new) instead and include:

- a description of the problem and its impact,
- steps to reproduce (a minimal `relwolf.yaml` helps),
- the affected relwolf version.

You will get a response as soon as possible. Once a fix is released, the advisory is published.

## Scope

relwolf runs in your CI with an access token. Relevant reports include, for example, token leaks in logs or error
messages, injection through commit messages, tags or merge request bodies, and unintended writes to the repository.
