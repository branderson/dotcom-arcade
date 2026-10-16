#!/usr/bin/env bash
# Shows what upstream flashpoint-web has changed since it was last merged, and
# how this project stands on each file it touches. Changes nothing but the
# refs/remotes/upstream/master ref. See docs/08-development/upstream-sync.md.
set -euo pipefail

URL=${UPSTREAM_URL:-https://github.com/darkraise/flashpoint-web.git}
BRANCH=master
UPSTREAM=refs/remotes/upstream/$BRANCH

cd "$(git rev-parse --show-toplevel)"
git fetch -q --no-tags "$URL" "+$BRANCH:$UPSTREAM"
base=$(git merge-base HEAD "$UPSTREAM")
count=$(git rev-list --count "$base..$UPSTREAM")

echo "Last merged from upstream: $(git log -1 --format='%h %ad %s' --date=short "$base")"
if ((count == 0)); then
  echo "Up to date with upstream $BRANCH."
  exit 0
fi

echo "$count new upstream commit(s):"
git log --format='  %h %ad %s' --date=short "$base..$UPSTREAM"
echo
echo "Files they change, by where this project stands on each:"
echo "  unchanged here: merges as is   changed here: merge both sides"
echo "  removed here: keep it removed   new upstream: take it, unless it belongs to a removed area"
echo
git diff --name-only "$base" "$UPSTREAM" | while IFS= read -r file; do
  if ! git cat-file -e "HEAD:$file" 2>/dev/null; then
    if git cat-file -e "$base:$file" 2>/dev/null; then
      echo "removed here    $file"
    else
      echo "new upstream    $file"
    fi
  elif git diff --quiet "$base" HEAD -- "$file"; then
    echo "unchanged here  $file"
  else
    echo "changed here    $file"
  fi
done | sort
