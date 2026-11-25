#!/usr/bin/env bash
# Deploy (only on the owner's word): tests, build check, push feature branch to master,
# tag YYYY.MM.DD-n. Netlify builds master → app.shiaiflow.com.
set -euo pipefail
cd "$(dirname "$0")/.."
branch=$(git rev-parse --abbrev-ref HEAD)
[ -z "$(git status --porcelain)" ] || { echo "Uncommitted changes — commit first."; exit 1; }
npm run -s test:logic >/dev/null
npm run -s build >/dev/null
day=$(TZ=Europe/Zagreb date +%Y.%m.%d)
git fetch -q --tags origin
n=1; while git rev-parse -q --verify "refs/tags/$day-$n" >/dev/null; do n=$((n+1)); done
tag="$day-$n"
git tag -a "$tag" -m "Deploy $tag ($(git rev-parse --short HEAD))"
git push -q origin "$branch" "$branch:master" "refs/tags/$tag"
echo "Deployed $(git rev-parse --short HEAD) as $tag — add a line to CHANGELOG.md."
