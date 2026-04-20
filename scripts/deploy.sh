#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
    echo "git is required" >&2
    exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required" >&2
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree is dirty. Commit or stash your changes before deploying." >&2
    exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "HEAD" ]]; then
    echo "Detached HEAD is not supported. Check out a branch before deploying." >&2
    exit 1
fi

version="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
if [[ -z "$version" ]]; then
    echo "Could not determine package.json version" >&2
    exit 1
fi

tag="v$version"

if git rev-parse "$tag" >/dev/null 2>&1; then
    echo "Tag $tag already exists locally" >&2
    exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
    echo "Tag $tag already exists on origin" >&2
    exit 1
fi

pnpm check
pnpm build

if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    git commit -m "release: $tag"
fi

git tag -a "$tag" -m "Release $tag"
git push origin "$branch"
git push origin "$tag"

echo "Published $tag from branch $branch"
