#!/usr/bin/env bash
# Publishes main and its release tags to a read-only mirror on GitHub.
#
#   MIRROR_SOURCE=<forge clone URL> mirror/github-mirror.sh    sync
#   ... mirror/github-mirror.sh --dry-run                      build and print, push nothing
#   mirror/github-mirror.sh --settings                         configure the GitHub repo (needs gh)
#   mirror/github-mirror.sh --transform DIR                    rewrite a checkout in place
#
# Runs on a host that can push to GitHub, never in a dejima session: a sandbox
# may push only to its own forge.
#
# The GitHub copy is not byte-for-byte. Its main is one extra commit on top of
# the forge's main, whose tree is the forge's with the rewrites in transform()
# applied, and whose parents are the forge commit and the previous mirror
# commit. So every forge SHA is in the mirror unchanged, and each sync is a
# fast-forward for anyone tracking it. Tags are pushed as they are, pointing at
# the untransformed forge commits.
#
# Environment:
#   MIRROR_SOURCE  forge clone URL (required to sync)
#   MIRROR_REPO    GitHub repository, default branderson/dotcom-arcade
#   MIRROR_TARGET  push URL, default git@github.com:$MIRROR_REPO.git
#   MIRROR_STATE   working bare repository, default ~/.cache/dotcom-arcade-github-mirror.git
set -euo pipefail

MIRROR_REPO="${MIRROR_REPO:-branderson/dotcom-arcade}"
MIRROR_TARGET="${MIRROR_TARGET:-git@github.com:$MIRROR_REPO.git}"
MIRROR_STATE="${MIRROR_STATE:-${XDG_CACHE_HOME:-$HOME/.cache}/dotcom-arcade-github-mirror.git}"

say() { echo "github-mirror: $*"; }
die() { say "$*" >&2; exit 1; }

WORK=""
cleanup() {
    [ -n "$WORK" ] || return 0
    git -C "$MIRROR_STATE" worktree remove --force "$WORK" 2>/dev/null || true
    rm -rf "$WORK"
}

# Rewrites a checkout for GitHub. Each rewrite is checked, so a README that
# drifted away from what this expects stops the mirror instead of publishing
# the forge's version. Running it twice changes nothing.
transform() {
    local readme="$1/README.md"
    # perl -i would write a symlink's target back as the README, publishing it.
    [ -f "$readme" ] && [ ! -L "$readme" ] || die "README.md is missing or a symlink in $1"

    # The first thing a visitor to a mirror does is open an issue or a pull
    # request. Under the title.
    grep -q '^> \*\*This is a read-only mirror' "$readme" || perl -0pi -e '
        s{^(# [^\n]*)\n}{$1\n\n> **This is a read-only mirror.** Dotcom Arcade is developed on a private\n> forge, and issues and pull requests are not accepted here.\n}m
    ' "$readme"
    grep -q '^> \*\*This is a read-only mirror' "$readme" \
        || die "README.md: no title to put the mirror notice under"
}

# Issues, pull requests, wiki and the like off; Actions stays on, since it
# publishes the images. Settings rather than content, so a sync does not
# reapply them; run once after creating the repository.
settings() {
    command -v gh >/dev/null || die "--settings needs the gh CLI"
    gh api -X PATCH "repos/$MIRROR_REPO" --silent \
        -F has_issues=false -F has_pull_requests=false -F has_projects=false \
        -F has_wiki=false -F has_discussions=false
}

sync() {
    [ -n "${MIRROR_SOURCE:-}" ] || die "MIRROR_SOURCE is not set"
    local git=(git -C "$MIRROR_STATE")
    trap cleanup EXIT
    [ -d "$MIRROR_STATE" ] || git init -q --bare "$MIRROR_STATE"

    "${git[@]}" fetch -q --no-tags --prune "$MIRROR_SOURCE" \
        '+refs/heads/main:refs/source/main' '+refs/tags/*:refs/source/tags/*'
    local src prev=""
    src="$("${git[@]}" rev-parse refs/source/main)"

    # An absent main (exit 2) is a first run; anything else is a real failure.
    local rc=0
    git ls-remote -q --exit-code "$MIRROR_TARGET" refs/heads/main >/dev/null || rc=$?
    if [ "$rc" -eq 0 ]; then
        "${git[@]}" fetch -q --no-tags "$MIRROR_TARGET" '+refs/heads/main:refs/mirror/main'
        prev="$("${git[@]}" rev-parse refs/mirror/main)"
    elif [ "$rc" -ne 2 ]; then
        die "cannot read $MIRROR_TARGET"
    fi

    WORK="$(mktemp -d)"
    "${git[@]}" worktree add -q --detach "$WORK" "$src"
    transform "$WORK"
    git -C "$WORK" add -A
    local tree
    tree="$(git -C "$WORK" write-tree)"

    if [ -n "$prev" ] && [ "$("${git[@]}" rev-parse "$prev^1")" = "$src" ] \
        && [ "$("${git[@]}" rev-parse "$prev^{tree}")" = "$tree" ]; then
        say "already at ${src:0:12}"
    else
        # The forge commit's committer and date, so the same input always
        # makes the same commit.
        local name email date commit
        IFS=$'\t' read -r name email date < <("${git[@]}" log -1 --format='%cn%x09%ce%x09%cI' "$src")
        commit="$(GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" GIT_AUTHOR_DATE="$date" \
            GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" GIT_COMMITTER_DATE="$date" \
            "${git[@]}" commit-tree "$tree" -p "$src" ${prev:+-p "$prev"} \
            -m "Mirror ${src:0:12} for GitHub" \
            -m "README header added by mirror/github-mirror.sh.")"
        "${git[@]}" update-ref refs/mirror/next "$commit"
        [ -n "$DRY_RUN" ] || "${git[@]}" push -q "$MIRROR_TARGET" "$commit:refs/heads/main"
        say "main is ${src:0:12} as ${commit:0:12}"
    fi

    # Only tags on main: one on another branch would publish unreleased work.
    local ref
    local refspecs=()
    while IFS= read -r ref; do
        if "${git[@]}" merge-base --is-ancestor "$ref" "$src"; then
            refspecs+=("$ref:refs/tags/${ref#refs/source/tags/}")
            say "tag ${ref#refs/source/tags/}"
        fi
    done < <("${git[@]}" for-each-ref --format='%(refname)' refs/source/tags/)
    [ "${#refspecs[@]}" -eq 0 ] || [ -n "$DRY_RUN" ] \
        || "${git[@]}" push -q "$MIRROR_TARGET" "${refspecs[@]}"
}

DRY_RUN=""
case "${1:-}" in
    "")          sync ;;
    --dry-run)   DRY_RUN=1; sync ;;
    --settings)  settings ;;
    --transform) [ -n "${2:-}" ] || die "--transform needs a directory"; transform "$2" ;;
    *)           sed -n '4,7p' "$0" >&2; exit 2 ;;
esac
