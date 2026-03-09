#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

remote="${GIT_SYNC_REMOTE:-origin}"
branch="${GIT_SYNC_BRANCH:-$(git branch --show-current)}"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
message="${1:-chore: sync ai-kp ${timestamp}}"

if [[ -z "${branch}" ]]; then
  printf 'Unable to determine current branch.\n' >&2
  exit 1
fi

has_changes=false
if ! git diff --quiet || ! git diff --cached --quiet; then
  has_changes=true
elif [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  has_changes=true
fi

if [[ "${has_changes}" == true ]]; then
  git add -A
  git commit -m "${message}"
else
  printf 'No local changes to commit.\n'
fi

git pull --rebase "${remote}" "${branch}"
git push "${remote}" "HEAD:${branch}"

printf 'Synced %s to %s/%s\n' "${repo_root}" "${remote}" "${branch}"
