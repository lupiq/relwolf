#!/bin/sh
# Run by relwolf (pre-commit-script) so that the generated changelog passes the Prettier check.
set -e
pnpm run format
